import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import * as wif from 'wif';

// Try to import ecpair, fallback to bitcoinjs-lib's ECPair if not available
let ECPair: any;
try {
  const ecpairModule = require('ecpair');
  const ECPairFactory = ecpairModule.ECPairFactory || ecpairModule.default;
  ECPair = ECPairFactory(ecc);
} catch (e) {
  // Fallback: use bitcoinjs-lib's built-in ECPair if ecpair not available
  // Note: bitcoinjs-lib v7+ requires ecpair as separate package
  throw new Error('ecpair package is required. Please install it: npm install ecpair');
}

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

export interface BitcoinTransactionParams {
  unsignedTxHex: string;
  utxos: Array<{
    tx_hash: string;
    vout: number;
    /** Required. ScriptPubKey hex for this output (no network fetch). */
    script_pub_key_hex: string;
    value: number;
    /** Required only for legacy P2PKH. Omit for SegWit (P2WPKH/P2WSH/P2TR) — fully offline with no previous tx. */
    previous_tx_hex?: string;
  }>;
  privateKeys: string[]; // WIF format private keys for each UTXO
  isMainnet?: boolean;
  /** If true, only SegWit inputs (P2WPKH, P2WSH, P2TR) are allowed; no previous_tx_hex required. */
  segwitOnly?: boolean;
}

export interface BitcoinSigningResult {
  signedTransactionHex: string;
  transactionId: string;
}

/**
 * Bitcoin (BTC) Transaction Signer
 * Offline signing only: uses only data provided in params (no network fetch).
 * Caller must provide script_pub_key_hex for every UTXO; for legacy P2PKH inputs, previous_tx_hex is required.
 */
export class BitcoinTransactionSigner {
  /**
   * Sign Bitcoin transaction
   * Real implementation for Bitcoin mainnet using bitcoinjs-lib
   * 
   * @param params - Transaction parameters
   * @returns Signed transaction
   */
  static async signTransaction(params: BitcoinTransactionParams): Promise<BitcoinSigningResult> {
    try {
      const isMainnet = params.isMainnet !== false; // Default to mainnet
      const network = isMainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
      
      // Parse unsigned transaction using bitcoinjs-lib
      let transaction: bitcoin.Transaction;
      try {
        transaction = bitcoin.Transaction.fromHex(params.unsignedTxHex.trim());
      } catch (error) {
        throw new Error(`Invalid unsigned transaction hex: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate UTXOs match transaction inputs
      if (transaction.ins.length !== params.utxos.length) {
        throw new Error(`UTXOs count (${params.utxos.length}) must match transaction inputs count (${transaction.ins.length})`);
      }

      if (params.privateKeys.length !== params.utxos.length) {
        throw new Error(`Private keys count (${params.privateKeys.length}) must match UTXOs count (${params.utxos.length})`);
      }

      // Create PSBT for signing (modern Bitcoin transaction signing)
      const psbt = new bitcoin.Psbt({ network });

      // Add all inputs and outputs to PSBT (no network fetch; use only provided data)
      for (let i = 0; i < params.utxos.length; i++) {
        const utxo = params.utxos[i];

        // Validate UTXO
        if (!utxo.tx_hash || typeof utxo.vout !== 'number' || typeof utxo.value !== 'number') {
          throw new Error(`Invalid UTXO at index ${i}: tx_hash, vout, and value are required`);
        }
        if (!utxo.script_pub_key_hex || typeof utxo.script_pub_key_hex !== 'string' || !utxo.script_pub_key_hex.trim()) {
          throw new Error(`UTXO at index ${i}: script_pub_key_hex is required (no network fetch)`);
        }

        const scriptPubKey = Buffer.from(utxo.script_pub_key_hex.trim(), 'hex');
        if (scriptPubKey.length === 0) {
          throw new Error(`UTXO at index ${i}: script_pub_key_hex must be valid hex`);
        }

        const prevTxHex = typeof utxo.previous_tx_hex === 'string' && utxo.previous_tx_hex.trim()
          ? utxo.previous_tx_hex.trim()
          : null;

        // bitcoinjs-lib compares input hash to nonWitnessUtxo.getHash() which returns double-SHA256 in natural (big-endian) order.
        // So we must pass hash in natural order (utxo.tx_hash as-is). Wire format (little-endian) is applied when serializing the final tx.
        const prevTxId = Buffer.from(utxo.tx_hash.trim(), 'hex');

        // P2PKH (legacy): 76 a9 14 [push] 88 ac. Requires previous_tx_hex (nonWitnessUtxo).
        const isP2PKH = scriptPubKey.length >= 5 &&
          scriptPubKey[0] === 0x76 && scriptPubKey[1] === 0xa9 && scriptPubKey[2] === 0x14 &&
          scriptPubKey[scriptPubKey.length - 2] === 0x88 && scriptPubKey[scriptPubKey.length - 1] === 0xac;

        if (params.segwitOnly && isP2PKH) {
          throw new Error(
            `SegWit-only signing: input at index ${i} is legacy P2PKH. Use P2WPKH/P2WSH/P2TR for fully offline (no previous_tx_hex).`
          );
        }

        if (isP2PKH) {
          // Legacy P2PKH: require previous_tx_hex (no network fetch)
          if (!prevTxHex) {
            throw new Error(
              `Legacy P2PKH input at index ${i} requires previous_tx_hex in UTXO (signing is offline; no network fetch)`
            );
          }
          let nonWitnessBuf: Buffer;
          try {
            nonWitnessBuf = Buffer.from(prevTxHex, 'hex');
          } catch {
            throw new Error(`UTXO at index ${i}: previous_tx_hex must be valid hex`);
          }
          const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
          if (prevTx.outs.length <= utxo.vout) {
            throw new Error(`UTXO at index ${i}: previous_tx_hex has no output at vout ${utxo.vout}`);
          }
          const outScript = prevTx.outs[utxo.vout].script;
          const expectedScript = Buffer.isBuffer(outScript) ? outScript : Buffer.from(outScript);
          if (!scriptPubKey.equals(expectedScript)) {
            throw new Error(`UTXO at index ${i}: script_pub_key_hex does not match output at vout ${utxo.vout} of previous_tx_hex`);
          }
          psbt.addInput({
            hash: prevTxId,
            index: utxo.vout,
            nonWitnessUtxo: nonWitnessBuf
          });
        } else {
          // SegWit (P2WPKH, etc.): use witnessUtxo (script + value from UTXO)
          const scriptUint8 = scriptPubKey instanceof Buffer ? scriptPubKey : Buffer.from(scriptPubKey);
          const valueBigInt = typeof utxo.value === 'bigint' ? utxo.value : BigInt(utxo.value);
          const inputData: any = {
            hash: prevTxId,
            index: utxo.vout,
            witnessUtxo: {
              script: scriptUint8,
              value: valueBigInt
            }
          };
          if (prevTxHex) {
            try {
              inputData.nonWitnessUtxo = Buffer.from(prevTxHex, 'hex');
            } catch {
              throw new Error(`UTXO at index ${i}: previous_tx_hex must be valid hex`);
            }
          }
          psbt.addInput(inputData);
        }
      }

      // Add all outputs from unsigned transaction
      for (const output of transaction.outs) {
        psbt.addOutput({
          script: output.script,
          value: output.value
        });
      }

      // Sign each input
      for (let i = 0; i < params.utxos.length; i++) {
        const privateKeyWif = params.privateKeys[i];

        // Parse private key from WIF (ECPair.fromPrivateKey expects Buffer; decoded.privateKey may be Uint8Array)
        let keyPair: any;
        try {
          const decoded = wif.decode(privateKeyWif);
          const privateKeyBuffer = Buffer.isBuffer(decoded.privateKey) ? decoded.privateKey : Buffer.from(decoded.privateKey);
          keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network });
        } catch (error) {
          throw new Error(`Invalid private key at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Sign the input
        psbt.signInput(i, keyPair);

        // Validate signatures. bitcoinjs-lib calls validator(pubkey, hash, signature); ecc.verify expects (hash, pubkey, signature).
        // tiny-secp256k1 also expects Uint8Array (Buffer can fail isUint8Array). Normalize and reorder.
        const verifyAdapter = (pubkey: Buffer | Uint8Array, hash: Buffer | Uint8Array, signature: Buffer | Uint8Array): boolean => {
          const h = hash instanceof Uint8Array ? hash : new Uint8Array(hash);
          const Q = pubkey instanceof Uint8Array ? pubkey : new Uint8Array(pubkey);
          const sig = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
          return ecc.verify(h, Q, sig);
        };
        if (!psbt.validateSignaturesOfInput(i, verifyAdapter)) {
          throw new Error(`Invalid signature for input ${i}`);
        }
      }

      // Finalize all inputs and extract signed transaction
      psbt.finalizeAllInputs();
      const signedTx = psbt.extractTransaction();

      // Bitcoin wire format uses natural byte order for prevout hash (first byte = byte 0 of double-SHA256).
      // We pass utxo.tx_hash in natural order; bitcoinjs keeps it; do NOT reverse before serializing.
      const signedHex = signedTx.toHex();
      const txId = signedTx.getId();

      return {
        signedTransactionHex: signedHex,
        transactionId: txId
      };
    } catch (error) {
      throw new Error(`Bitcoin transaction signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
