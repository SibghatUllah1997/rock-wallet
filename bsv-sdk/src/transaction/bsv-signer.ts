import { PrivateKey, P2PKH, Transaction as BsvTransaction, LockingScript } from '@bsv/sdk';
import axios from 'axios';

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

        // Set unlocking script template
        input.unlockingScriptTemplate = new P2PKH().unlock(privateKey);
      }

      // Sign the transaction
      await transaction.sign();

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

