import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import axios from 'axios';
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
    script_pub_key_hex: string;
    value: number;
  }>;
  privateKeys: string[]; // WIF format private keys for each UTXO
  isMainnet?: boolean;
  rpcUrl?: string;
}

export interface BitcoinSigningResult {
  signedTransactionHex: string;
  transactionId: string;
}

/**
 * Bitcoin (BTC) Transaction Signer
 * Real implementation for Bitcoin mainnet - uses bitcoinjs-lib (Bitcoin-specific)
 * Uses Bitcoin network APIs for fetching transaction data
 */
export class BitcoinTransactionSigner {
  private static readonly BITCOIN_MAINNET_API = 'https://blockstream.info/api';
  private static readonly BITCOIN_TESTNET_API = 'https://blockstream.info/testnet/api';

  /**
   * Fetch previous transaction hex from Bitcoin network
   * @param txid - Transaction ID
   * @param isMainnet - Network type
   * @param rpcUrl - Optional custom RPC URL
   * @returns Transaction hex
   */
  private static async fetchPreviousTransactionHex(
    txid: string,
    isMainnet: boolean = true,
    rpcUrl?: string
  ): Promise<string> {
    try {
      const baseUrl = rpcUrl || (isMainnet ? this.BITCOIN_MAINNET_API : this.BITCOIN_TESTNET_API);
      const url = `${baseUrl}/tx/${txid}/hex`;
      const { data } = await axios.get(url, { timeout: 10000, responseType: 'text' });
      return typeof data === 'string' ? data : String(data);
    } catch (error) {
      throw new Error(`Failed to fetch Bitcoin transaction ${txid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

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

      // Add all inputs and outputs to PSBT
      for (let i = 0; i < params.utxos.length; i++) {
        const utxo = params.utxos[i];
        
        // Validate UTXO
        if (!utxo.tx_hash || typeof utxo.vout !== 'number' || typeof utxo.value !== 'number') {
          throw new Error(`Invalid UTXO at index ${i}`);
        }

        // Get scriptPubKey from UTXO
        let scriptPubKey: Buffer;
        let prevTxHex: string | null = null;
        
        if (utxo.script_pub_key_hex) {
          scriptPubKey = Buffer.from(utxo.script_pub_key_hex.trim(), 'hex');
        } else {
          // Fetch previous transaction to get scriptPubKey
          try {
            prevTxHex = await this.fetchPreviousTransactionHex(utxo.tx_hash.trim(), isMainnet, params.rpcUrl);
            const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
            if (prevTx.outs.length <= utxo.vout) {
              throw new Error(`Previous transaction output index ${utxo.vout} not found`);
            }
            const script = prevTx.outs[utxo.vout].script;
            scriptPubKey = Buffer.isBuffer(script) ? script : Buffer.from(script);
          } catch (error) {
            throw new Error(`Failed to get scriptPubKey for UTXO ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Convert tx_hash to Buffer (little-endian for Bitcoin transaction ID)
        const prevTxId = Buffer.from(utxo.tx_hash, 'hex').reverse();
        
        // Add input to PSBT
        const inputData: any = {
          hash: prevTxId, // Buffer in little-endian format
          index: utxo.vout,
          witnessUtxo: {
            script: scriptPubKey,
            value: utxo.value
          }
        };

        // Add nonWitnessUtxo if we have the full previous transaction (for non-segwit)
        if (prevTxHex) {
          inputData.nonWitnessUtxo = Buffer.from(prevTxHex, 'hex');
        }

        psbt.addInput(inputData);
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

        // Parse private key from WIF
        let keyPair: any;
        try {
          const decoded = wif.decode(privateKeyWif);
          // decoded.privateKey is already a Buffer
          keyPair = ECPair.fromPrivateKey(decoded.privateKey, { network });
        } catch (error) {
          throw new Error(`Invalid private key at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Sign the input
        psbt.signInput(i, keyPair);

        // Validate signatures
        if (!psbt.validateSignaturesOfInput(i, ecc.verify)) {
          throw new Error(`Invalid signature for input ${i}`);
        }
      }

      // Finalize all inputs and extract signed transaction
      psbt.finalizeAllInputs();
      const signedTx = psbt.extractTransaction();

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
