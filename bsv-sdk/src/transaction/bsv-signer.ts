import {
  PrivateKey,
  P2PKH,
  Transaction as BsvTransaction,
  LockingScript,
  UnlockingScript,
  TransactionSignature,
  Hash,
  Script
} from '@bsv/sdk';
import axios from 'axios';
import { getLockingScriptType, is1SatStyleScript, getEffectiveScriptFor1Sat, type LockingScriptType } from './protocols';

/**
 * Create P2PK (pay-to-pubkey) unlock template: unlocking script is [signature] only.
 * Uses @bsv/sdk TransactionSignature and Hash for correct sighash (BSV/BCH fork).
 */
function createP2PKUnlockTemplate(
  privateKey: PrivateKey,
  signOutputs: SignOutputsScope,
  anyoneCanPay: boolean,
  sourceSatoshis: number,
  lockingScript: Script
): { sign: (tx: BsvTransaction, inputIndex: number) => Promise<UnlockingScript>; estimateLength: () => Promise<number> } {
  let signatureScope = TransactionSignature.SIGHASH_FORKID;
  if (signOutputs === 'all') signatureScope |= TransactionSignature.SIGHASH_ALL;
  if (signOutputs === 'none') signatureScope |= TransactionSignature.SIGHASH_NONE;
  if (signOutputs === 'single') signatureScope |= TransactionSignature.SIGHASH_SINGLE;
  if (anyoneCanPay) signatureScope |= TransactionSignature.SIGHASH_ANYONECANPAY;

  return {
    sign: async (tx: BsvTransaction, inputIndex: number) => {
      const input = tx.inputs[inputIndex];
      const otherInputs = tx.inputs.filter((_, index) => index !== inputIndex);
      const sourceTXID = input.sourceTXID ?? (input as any).sourceTransaction?.id?.('hex');
      if (sourceTXID == null || sourceTXID === '') {
        throw new Error('The input sourceTXID or sourceTransaction is required for transaction signing.');
      }
      const preimage = TransactionSignature.format({
        sourceTXID,
        sourceOutputIndex: input.sourceOutputIndex!,
        sourceSatoshis,
        transactionVersion: tx.version,
        otherInputs,
        inputIndex,
        outputs: tx.outputs,
        inputSequence: input.sequence ?? 0xffffffff,
        subscript: lockingScript,
        lockTime: tx.lockTime,
        scope: signatureScope
      });
      const rawSignature = privateKey.sign(Hash.sha256(preimage));
      const sig = new TransactionSignature(rawSignature.r, rawSignature.s, signatureScope);
      const sigForScript = sig.toChecksigFormat();
      return new UnlockingScript([{ op: sigForScript.length, data: sigForScript }]);
    },
    estimateLength: async () => 73 + 1
  };
}

export type SignOutputsScope = 'all' | 'none' | 'single';

export interface BSVTransactionParams {
  unsignedTxHex: string;
  utxos: Array<{
    tx_hash: string;
    vout: number;
    script_pub_key_hex?: string;
    value: number;
  }>;
  privateKeys: string[]; // WIF format private keys for each UTXO
  isTestnet?: boolean;
  rpcUrl?: string;
  /** Optional: per-input or global sighash. MNEE/1Sat/STAS/RUN may require 'single' or anyoneCanPay in some flows. */
  signOutputs?: SignOutputsScope;
  anyoneCanPay?: boolean;
}

export interface BSVSigningResult {
  signedTransactionHex: string;
  transactionId: string;
}

/**
 * BSV Transaction Signer
 * Real implementation for BSV mainnet/testnet - no mocks
 * Uses BSV network APIs for fetching transaction data
 */
export class BSVTransactionSigner {
  private static readonly BSV_MAINNET_API = 'https://api.whatsonchain.com/v1/bsv/main';
  private static readonly BSV_TESTNET_API = 'https://api.whatsonchain.com/v1/bsv/test';

  /**
   * Fetch previous transaction hex from BSV network
   * @param txid - Transaction ID
   * @param isTestnet - Network type
   * @param rpcUrl - Optional custom RPC URL
   * @returns Transaction hex
   */
  private static async fetchPreviousTransactionHex(
    txid: string,
    isTestnet: boolean = false,
    rpcUrl?: string
  ): Promise<string> {
    try {
      const baseUrl = rpcUrl || (isTestnet ? this.BSV_TESTNET_API : this.BSV_MAINNET_API);
      const url = `${baseUrl}/tx/${txid}/hex`;
      const { data } = await axios.get(url, { timeout: 10000, responseType: 'text' });
      return typeof data === 'string' ? data : String(data);
    } catch (error) {
      throw new Error(`Failed to fetch BSV transaction ${txid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign BSV transaction
   * Real implementation for BSV mainnet/testnet
   * 
   * @param params - Transaction parameters
   * @returns Signed transaction
   */
  static async signTransaction(params: BSVTransactionParams): Promise<BSVSigningResult> {
    try {
      const isTestnet = params.isTestnet || false;
      
      // Validate transaction hex format before parsing
      const trimmedHex = params.unsignedTxHex.trim();
      if (!trimmedHex || trimmedHex.length < 20) {
        throw new Error('Transaction hex is too short or empty');
      }
      if (!/^[0-9a-fA-F]+$/.test(trimmedHex)) {
        throw new Error('Transaction hex contains invalid characters (must be hexadecimal)');
      }
      if (trimmedHex.length % 2 !== 0) {
        throw new Error('Transaction hex length must be even (each byte is 2 hex characters)');
      }

      // Parse unsigned transaction
      let transaction: BsvTransaction;
      try {
        transaction = BsvTransaction.fromHex(trimmedHex);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        // Provide more helpful error message for common issues
        if (errorMsg.includes('Number can only safely store') || errorMsg.includes('53 bits')) {
          throw new Error('Transaction hex contains values that exceed safe integer limits. The transaction may be malformed or invalid.');
        }
        throw new Error(`Invalid unsigned transaction hex: ${errorMsg}`);
      }

      // Snapshot output amounts and locking scripts so we never change them. Signing must not modify
      // outputs (signatures are over the exact outputs); restore after sign() to guarantee validity.
      const outputSnapshot: Array<{ satoshis: number; lockingScript: LockingScript }> = (transaction.outputs || []).map((o) => ({
        satoshis: typeof o.satoshis === 'number' ? o.satoshis : 0,
        lockingScript: o.lockingScript
      }));

      // Validate UTXOs match transaction inputs
      if (transaction.inputs.length !== params.utxos.length) {
        throw new Error(`UTXOs count (${params.utxos.length}) must match transaction inputs count (${transaction.inputs.length})`);
      }

      if (params.privateKeys.length !== params.utxos.length) {
        throw new Error(`Private keys count (${params.privateKeys.length}) must match UTXOs count (${params.utxos.length})`);
      }

      // Sign each input
      for (let i = 0; i < params.utxos.length; i++) {
        const utxo = params.utxos[i];
        const privateKeyWif = params.privateKeys[i];

        // Validate UTXO
        if (!utxo.tx_hash || typeof utxo.vout !== 'number' || typeof utxo.value !== 'number') {
          throw new Error(`Invalid UTXO at index ${i}`);
        }

        // Parse private key
        let privateKey: PrivateKey;
        try {
          privateKey = PrivateKey.fromWif(privateKeyWif);
        } catch (error) {
          throw new Error(`Invalid private key at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Fetch previous transaction from BSV network (real, not mock)
        let sourceTransaction: BsvTransaction;
        if (utxo.script_pub_key_hex) {
          try {
            const lockingScript = LockingScript.fromHex(utxo.script_pub_key_hex.trim());
            sourceTransaction = new BsvTransaction(1, [], []);
            const outputs = Array(Math.max(utxo.vout + 1, 1)).fill(null);
            outputs[utxo.vout] = {
              satoshis: utxo.value,
              lockingScript
            };
            sourceTransaction.outputs = outputs as any;
            // Critical: synthetic tx's id() would be wrong. Sighash preimage must use the REAL previous txid.
            // We set sourceTXID below so P2PKH.unlock() uses it instead of sourceTransaction.id('hex').
          } catch (scriptError) {
            // Fallback to fetching from network
            try {
              const prevTxHex = await this.fetchPreviousTransactionHex(utxo.tx_hash.trim(), isTestnet, params.rpcUrl);
              sourceTransaction = BsvTransaction.fromHex(prevTxHex);
            } catch (fetchError) {
              throw new Error(`Failed to create source transaction for UTXO ${i}: ${scriptError instanceof Error ? scriptError.message : 'Unknown error'}`);
            }
          }
        } else {
          // Real network call - no mocks (uses BSV network API)
          const prevTxHex = await this.fetchPreviousTransactionHex(utxo.tx_hash.trim(), isTestnet, params.rpcUrl);
          sourceTransaction = BsvTransaction.fromHex(prevTxHex);
        }

        // Set source transaction and output index
        const input: any = transaction.inputs[i];
        input.sourceTransaction = sourceTransaction;
        input.sourceOutputIndex = utxo.vout;
        input.sourceSatoshis = utxo.value;
        input.sequence = input.sequence ?? 0xffffffff;
        // When we built a synthetic sourceTransaction (from script_pub_key_hex), its id() is wrong.
        // Sighash preimage must use the real previous txid. Set sourceTXID so unlock template uses it.
        if (utxo.script_pub_key_hex && utxo.tx_hash) {
          input.sourceTXID = utxo.tx_hash.trim();
        }

        // Locking script of the output we're spending (required for correct scriptCode in sighash; MNEE/1Sat/STAS/RUN compatible)
        const lockingScript = (sourceTransaction.outputs && sourceTransaction.outputs[utxo.vout])
          ? sourceTransaction.outputs[utxo.vout].lockingScript
          : LockingScript.fromHex(utxo.script_pub_key_hex!.trim());
        const sourceSatoshis = utxo.value;
        const scriptType: LockingScriptType = getLockingScriptType(lockingScript);
        const signOutputs: SignOutputsScope = params.signOutputs ?? 'all';
        const anyoneCanPay = params.anyoneCanPay ?? false;

        // For 1Sat-style (OP_FALSE OP_IF ... OP_ENDIF <spendable>), the node uses only the part after
        // OP_ENDIF as scriptCode when verifying; use that same part for sighash or verification fails / stack errors.
        const effective1Sat = is1SatStyleScript(lockingScript) ? getEffectiveScriptFor1Sat(lockingScript) : null;
        const scriptForSighash = effective1Sat ?? lockingScript;

        if (scriptType === 'p2pk') {
          input.unlockingScriptTemplate = createP2PKUnlockTemplate(privateKey, signOutputs, anyoneCanPay, sourceSatoshis, scriptForSighash);
        } else {
          input.unlockingScriptTemplate = new P2PKH().unlock(privateKey, signOutputs, anyoneCanPay, sourceSatoshis, scriptForSighash);
        }
      }

      // Restore outputs from snapshot before sign() so the sighash preimage uses the exact amounts from the unsigned tx.
      if (transaction.outputs && outputSnapshot.length === transaction.outputs.length) {
        for (let j = 0; j < outputSnapshot.length; j++) {
          (transaction.outputs[j] as any).satoshis = outputSnapshot[j].satoshis;
          (transaction.outputs[j] as any).lockingScript = outputSnapshot[j].lockingScript;
        }
      }

      // Sign the transaction (signatures are over the restored outputs)
      await transaction.sign();

      // Restore again after sign() in case the SDK or any callback mutated outputs; serialization must match what was signed.
      if (transaction.outputs && outputSnapshot.length === transaction.outputs.length) {
        for (let j = 0; j < outputSnapshot.length; j++) {
          (transaction.outputs[j] as any).satoshis = outputSnapshot[j].satoshis;
          (transaction.outputs[j] as any).lockingScript = outputSnapshot[j].lockingScript;
        }
      }

      const signedHex = transaction.toHex();
      const txId = String(transaction.hash('hex'));

      return {
        signedTransactionHex: signedHex,
        transactionId: txId
      };
    } catch (error) {
      throw new Error(`BSV transaction signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

