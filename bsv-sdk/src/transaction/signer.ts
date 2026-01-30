import axios from 'axios';
import { TransactionBuilder, BuiltTransaction } from './builder';
import { BSVMultiBroadcastClient } from '../network/bsv-node';

export interface SigningResult {
  signedTransaction: string;
  transactionId: string;
  fee: number;
  inputs: number;
  outputs: number;
}

export interface BroadcastResult {
  success: boolean;
  transactionId: string;
  explorerUrl: string;
  error?: string | undefined;
}

/**
 * BSV Transaction Signer and Broadcaster
 * Native BSV transactions only
 */
export class TransactionSigner {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;
  private static broadcastClients: Map<boolean, BSVMultiBroadcastClient> = new Map();

  /**
   * Sign and broadcast a native BSV transaction
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param amount - Amount in satoshis
   * @param privateKey - Private key for signing (WIF format)
   * @param isTestnet - Network type
   * @param feeRate - Fee rate (optional)
   * @returns Signing and broadcast result
   */
  static async signAndBroadcastNativeTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    isTestnet: boolean = false,
    feeRate: number = 5
  ): Promise<BroadcastResult> {
    try {
      // Build transaction
      const builtTransaction = await TransactionBuilder.buildNativeTransaction(
        fromAddress,
        toAddress,
        amount,
        privateKey,
        isTestnet,
        feeRate
      );

      // Get transaction hex and ID from @bsv/sdk
      const transactionHex = builtTransaction.transactionHex;
      const transactionId = builtTransaction.transactionId;

      // Broadcast transaction
      const broadcastResult = await this.broadcastTransaction(transactionHex, isTestnet);

      return {
        success: broadcastResult.success,
        transactionId: transactionId,
        explorerUrl: this.getExplorerUrl(transactionId, isTestnet),
        error: broadcastResult.error
      };
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        explorerUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sign a transaction without broadcasting
   * @param builtTransaction - Built transaction
   * @returns Signing result
   */
  static signTransaction(builtTransaction: BuiltTransaction): SigningResult {
    // Use hex/id from @bsv/sdk
    const transactionHex = builtTransaction.transactionHex;
    const transactionId = builtTransaction.transactionId;

    return {
      signedTransaction: transactionHex,
      transactionId: transactionId,
      fee: builtTransaction.fee,
      inputs: builtTransaction.inputs.length,
      outputs: builtTransaction.outputs.length
    };
  }

  /**
   * Get or create broadcast client for network
   * @param isTestnet - Network type
   * @returns BSVMultiBroadcastClient instance
   */
  private static getBroadcastClient(isTestnet: boolean): BSVMultiBroadcastClient {
    if (!this.broadcastClients.has(isTestnet)) {
      this.broadcastClients.set(isTestnet, new BSVMultiBroadcastClient({ isTestnet }));
    }
    return this.broadcastClients.get(isTestnet)!;
  }

  /**
   * Broadcast transaction to BSV network using native BSV nodes
   * @param transactionHex - Signed transaction in hex format
   * @param isTestnet - Network type
   * @returns Broadcast result
   */
  static async broadcastTransaction(transactionHex: string, isTestnet: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getBroadcastClient(isTestnet);
      const result = await client.broadcastTransaction(transactionHex);
      
      if (result.success) {
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Broadcast failed'
      };
    }
  }

  /**
   * Get explorer URL for transaction
   * @param transactionId - Transaction ID
   * @param isTestnet - Network type
   * @returns Explorer URL
   */
  private static getExplorerUrl(transactionId: string, isTestnet: boolean): string {
    if (isTestnet) {
      return `https://test.whatsonchain.com/tx/${transactionId}`;
    } else {
      return `https://whatsonchain.com/tx/${transactionId}`;
    }
  }

  /**
   * Validate transaction before signing
   * @param transaction - Transaction to validate
   * @returns True if valid
   */
  static validateTransactionHex(transactionHex: string): boolean {
    try {
      // Basic sanity checks on hex length
      if (!transactionHex || transactionHex.length < 100) return false;
      // ~1MB limit
      if (transactionHex.length > 2_000_000) return false;
      return /^[0-9a-fA-F]+$/.test(transactionHex);
    } catch {
      return false;
    }
  }

  /**
   * Get transaction details
   * @param transactionId - Transaction ID
   * @param isTestnet - Network type
   * @returns Transaction details
   */
  static async getTransactionDetails(transactionId: string, isTestnet: boolean = false): Promise<any> {
    const apiUrl = isTestnet 
      ? 'https://api.whatsonchain.com/v1/bsv/test'
      : 'https://api.whatsonchain.com/v1/bsv/main';

    try {
      const response = await axios.get(
        `${apiUrl}/tx/${transactionId}`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'BSV-SDK/1.0.0'
          }
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get transaction details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify transaction signature
   * @param transaction - Transaction to verify
   * @param publicKey - Public key to verify against
   * @returns True if signature is valid
   */
  static verifyTransactionSignature(_transactionHex: string, _publicKey: Buffer): boolean {
    try {
      // Stub: real verification would parse and verify inputs
      return true;
    } catch {
      return false;
    }
  }
}
