import * as crypto from 'crypto';
import { BSVSDK, DerivationManager, XPubManager } from '../../../bsv-sdk/dist/index';
import { ShardingService } from './ShardingService';
import Wallet from '../models/Wallet';

export interface TransactionRequest {
  walletId: string;
  toAddress: string;
  amount: number; // in satoshis
  feeRate?: number;
  changeAddress?: string;
  shardFromClient: string; // 1 shard from client
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  transactionHex?: string;
  fee?: number;
  error?: string;
  explorerUrl?: string;
  fromAddress?: string;
}

export interface UserTransactionRequest {
  user: any; // User document from database
  shardFromUser: string; // One shard from user for 2-of-3 recovery
  derivationPath: string;
  toAddress: string;
  amount: number; // in satoshis
  feeRate?: number;
  network: 'testnet' | 'mainnet';
  utxoAlgorithm?: 'smallest-first' | 'largest-first' | 'random';
}

export interface TransactionInfo {
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  fee: number;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  blockHeight?: number;
  timestamp: Date;
}

/**
 * Transaction Service
 * Handles transaction building and signing with shard recovery
 */
export class TransactionService {
  private sdk: BSVSDK;
  private isTestnet: boolean;

  constructor(isTestnet: boolean = false) {
    this.isTestnet = isTestnet;
    this.sdk = new BSVSDK({ isTestnet });
  }

  /**
   * Sign and broadcast a transaction using shard recovery
   * @param request - Transaction request with shard from client
   * @returns Transaction result
   */
  async signAndBroadcastTransaction(request: TransactionRequest): Promise<TransactionResult> {
    try {
      // Get wallet information
      const wallet = await Wallet.findOne({ walletId: request.walletId, isActive: true });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Recover mnemonic using 1 shard from DB + 1 shard from client
      const mnemonic = ShardingService.recoverMnemonicFromShards(
        wallet.shard1, // 1 shard from DB
        request.shardFromClient // 1 shard from client
      );

      // Generate keypair from mnemonic for the from address
      // Use BSV SDK to generate keypair at derivation path m/44'/0'/0'/0/0
      const { BSVSDK } = await import('../../../bsv-sdk/dist/index');
      const sdk = new BSVSDK({ isTestnet: this.isTestnet });
      const signingData = sdk.generateKeyPairAtIndex(mnemonic, 0, 0, 'p2pkh');

      // Get UTXOs for the from address
      const fromAddress = signingData.address;
      const utxos = await this.sdk.getUTXOs(fromAddress);
      
      // Use signingData.privateKey for transaction signing

      if (utxos.length === 0) {
        throw new Error('No UTXOs available for spending');
      }

      // Calculate fee
      const feeRate = request.feeRate || 5; // satoshis per byte
      const estimatedFee = this.estimateTransactionFee(1, 2, feeRate); // 1 input, 2 outputs

      // Check balance
      const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
      if (totalBalance < request.amount + estimatedFee) {
        throw new Error(`Insufficient balance: need ${request.amount + estimatedFee} satoshis, have ${totalBalance} satoshis`);
      }

      // Build transaction
      const transaction = await this.buildTransaction(
        fromAddress,
        request.toAddress,
        request.amount,
        signingData.privateKey,
        utxos,
        request.changeAddress || fromAddress,
        feeRate
      );

      // Broadcast transaction
      const broadcastResult = await this.sdk.broadcastTransactionNative(transaction.hex);

      if (broadcastResult.success) {
        return {
          success: true,
          transactionId: broadcastResult.txid,
          transactionHex: transaction.hex,
          fee: transaction.fee,
          explorerUrl: this.sdk.getExplorerUrl(broadcastResult.txid!)
        };
      } else {
        return {
          success: false,
          error: broadcastResult.error || 'Transaction broadcast failed'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build transaction using SDK
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param amount - Amount in satoshis
   * @param privateKey - Private key for signing
   * @param utxos - UTXOs to spend
   * @param changeAddress - Change address
   * @param feeRate - Fee rate
   * @returns Built transaction
   */
  private async buildTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    utxos: any[],
    changeAddress: string,
    feeRate: number
  ): Promise<{ hex: string; txid: string; fee: number }> {
    try {
      // Use SDK to build and sign transaction
      const result = await this.sdk.signTransaction({
        fromAddress,
        toAddress,
        amount,
        privateKey,
        feeRate,
        changeAddress
      });

      return {
        hex: result.signedTransactionHex,
        txid: result.transactionId,
        fee: result.fee
      };

    } catch (error) {
      throw new Error(`Failed to build transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate transaction fee
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate in satoshis per byte
   * @returns Estimated fee in satoshis
   */
  private estimateTransactionFee(inputCount: number, outputCount: number, feeRate: number): number {
    // Base transaction size: version (4) + input count (1-9) + output count (1-9) + locktime (4)
    let size = 4 + 1 + 1 + 4;
    
    // Input size: previous output (36) + script length (1-9) + script (107) + sequence (4)
    size += inputCount * (36 + 1 + 107 + 4);
    
    // Output size: value (8) + script length (1-9) + script (25)
    size += outputCount * (8 + 1 + 25);
    
    return size * feeRate;
  }

  /**
   * Get transaction information
   * @param transactionId - Transaction ID
   * @returns Transaction information
   */
  async getTransactionInfo(transactionId: string): Promise<TransactionInfo | null> {
    try {
      const txInfo = await this.sdk.getTransaction(transactionId);
      
      return {
        transactionId: txInfo.txid,
        fromAddress: txInfo.vin?.[0]?.address || 'Unknown',
        toAddress: txInfo.vout?.[0]?.address || 'Unknown',
        amount: txInfo.vout?.[0]?.value || 0,
        fee: 0, // Fee calculation would need to be implemented
        status: txInfo.confirmations > 0 ? 'confirmed' : 'pending',
        confirmations: txInfo.confirmations || 0,
        blockHeight: txInfo.blockHeight,
        timestamp: new Date() // Timestamp would need to be calculated from block data
      };

    } catch (error) {
      console.error('Failed to get transaction info:', error);
      return null;
    }
  }

  /**
   * Get transaction status
   * @param transactionId - Transaction ID
   * @returns Transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed' | 'not_found';
    confirmations: number;
    blockHeight?: number;
  }> {
    try {
      const txInfo = await this.sdk.getTransaction(transactionId);
      
      return {
        status: txInfo.confirmations > 0 ? 'confirmed' : 'pending',
        confirmations: txInfo.confirmations || 0,
        blockHeight: txInfo.blockHeight
      };

    } catch (error) {
      return {
        status: 'not_found',
        confirmations: 0
      };
    }
  }

  /**
   * Validate transaction request
   * @param request - Transaction request
   * @returns Validation result
   */
  validateTransactionRequest(request: TransactionRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.walletId) {
      errors.push('Wallet ID is required');
    }

    if (!request.toAddress) {
      errors.push('To address is required');
    }

    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!request.shardFromClient) {
      errors.push('Shard from client is required');
    }

    // Validate address format
    if (request.toAddress && !this.validateAddress(request.toAddress)) {
      errors.push('Invalid to address format');
    }

    if (request.changeAddress && !this.validateAddress(request.changeAddress)) {
      errors.push('Invalid change address format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate address format
   * @param address - Address to validate
   * @returns True if valid
   */
  private validateAddress(address: string): boolean {
    try {
      return this.sdk.validateAddress(address);
    } catch {
      return false;
    }
  }

  /**
   * Get transaction history for a wallet
   * @param walletId - Wallet ID
   * @param limit - Maximum number of transactions
   * @returns Transaction history
   */
  async getTransactionHistory(walletId: string, limit: number = 50): Promise<TransactionInfo[]> {
    try {
      // Get wallet addresses
      const wallet = await Wallet.findOne({ walletId, isActive: true });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // For now, return empty array - in real implementation, 
      // you would query blockchain for transaction history
      return [];

    } catch (error) {
      throw new Error(`Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get dynamic fee estimates from WhatsonChain API
   * @param network - Network type (testnet or mainnet)
   * @returns Fee estimates with real-time data
   */
  async getFeeEstimates(network: 'testnet' | 'mainnet' = 'testnet'): Promise<{
    slow: number;
    medium: number;
    fast: number;
    timestamp: number;
    source: string;
  }> {
    try {
      // Use SDK's getDynamicFees which uses real network API
      const fees = await this.sdk.getDynamicFees();
      
      return {
        slow: Math.floor(fees.slowFee / 250), // Convert to sat/byte
        medium: fees.feeRate,
        fast: Math.ceil(fees.fastFee / 250), // Convert to sat/byte
        timestamp: fees.timestamp,
        source: 'sdk-network-api'
      };
    } catch (error) {
      console.warn('Error getting fee estimates from SDK, using defaults:', error);
      // Fallback to reasonable defaults
      return {
        slow: network === 'mainnet' ? 5 : 1,
        medium: network === 'mainnet' ? 10 : 3,
        fast: network === 'mainnet' ? 20 : 5,
        timestamp: Date.now(),
        source: 'fallback-default'
      };
    }
  }

  /**
   * Sign and broadcast transaction using user credentials and derivation path
   */
  async signAndBroadcastTransactionFromUser(request: UserTransactionRequest): Promise<TransactionResult> {
    try {
      const { user, shardFromUser, derivationPath, toAddress, amount, feeRate, network, utxoAlgorithm = 'smallest-first' } = request;
      
      // Recover mnemonic using 2-of-3 shard recovery:
      // 1 shard from user + 1 shard from database
      const recoveredMnemonic = await ShardingService.recoverMnemonicFromShards(
        shardFromUser,    // User's shard
        user.shard1       // Database shard
      );

      // Generate xPub from recovered mnemonic
      const xPubInfo = XPubManager.generateXPub(recoveredMnemonic, network === 'testnet', 0);
      const xPub = xPubInfo.xpub;

      // Generate root key for private key derivation
      const rootKey = DerivationManager.generateRootKey(recoveredMnemonic, network === 'testnet');
      
      // Derive private key for the specific derivation path
      const privateKey = this.derivePrivateKeyFromPath(rootKey, derivationPath);
      
      // Derive the from address from the derivation path
      const addressResult = XPubManager.deriveAddressFromXPub(
        xPub,
        parseInt(derivationPath.split('/')[4]), // address index
        parseInt(derivationPath.split('/')[3])  // change index
      );
      const fromAddress = addressResult.address;

      // Get UTXOs for the from address
      const allUtxos = await this.getUTXOs(fromAddress, network === 'testnet');
      
      if (allUtxos.length === 0) {
        return {
          success: false,
          error: 'No UTXOs found for the specified address'
        };
      }

      // Calculate fee if not provided
      const finalFeeRate = feeRate || 5; // Default fee rate
      
      // Dynamic UTXO selection
      const { selected: selectedUtxos, change } = this.selectUTXOs(
        allUtxos, 
        amount, 
        finalFeeRate, 
        utxoAlgorithm
      );

      if (selectedUtxos.length === 0) {
        return {
          success: false,
          error: 'Insufficient funds for the transaction'
        };
      }

      // Calculate actual fee based on selected UTXOs
      const actualFee = finalFeeRate * 250; // Rough estimate
      
      // Build transaction
      const transaction = await this.buildTransaction(
        fromAddress,
        toAddress,
        amount,
        privateKey.toString('hex'),
        selectedUtxos,
        fromAddress,
        finalFeeRate
      );

      // Broadcast transaction
      const broadcastResult = await this.broadcastTransaction(transaction.hex, network === 'testnet');
      
      if (broadcastResult.success) {
        return {
          success: true,
          transactionId: broadcastResult.transactionId,
          transactionHex: transaction.hex,
          fee: transaction.fee,
          fromAddress: fromAddress,
          explorerUrl: this.getExplorerUrl(broadcastResult.transactionId, network === 'testnet')
        };
      } else {
        return {
          success: false,
          error: broadcastResult.error || 'Failed to broadcast transaction'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Derive private key from root key and derivation path
   */
  private derivePrivateKeyFromPath(rootKey: any, derivationPath: string): Buffer {
    const pathParts = derivationPath.split('/');
    let key = rootKey;
    
    // Skip 'm' and iterate through path parts
    for (let i = 1; i < pathParts.length; i++) {
      const part = pathParts[i];
      const index = parseInt(part.replace("'", ''));
      const hardened = part.endsWith("'");
      
      if (hardened) {
        key = key.deriveHardened(index);
      } else {
        key = key.derive(index);
      }
    }
    
    return key.privateKey!;
  }

  /**
   * Get UTXOs for an address with dynamic selection
   */
  async getUTXOs(address: string, isTestnet: boolean): Promise<any[]> {
    try {
      const explorerUrl = isTestnet 
        ? 'https://api.whatsonchain.com/v1/bsv/test/address'
        : 'https://api.whatsonchain.com/v1/bsv/main/address';
      
      const response = await fetch(`${explorerUrl}/${address}/unspent`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
      }
      
      const utxos = await response.json();
      
      // Transform the response to our expected format
      return utxos.map((utxo: any) => ({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        value: utxo.value,
        scriptPubKey: utxo.script,
        confirmations: utxo.height ? 1 : 0 // Simplified for now
      }));
      
    } catch (error) {
      console.error('Error fetching UTXOs:', error);
      // Throw error instead of returning mock data for production
      throw new Error(`Failed to fetch UTXOs for address ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current block height
   */
  private async getCurrentBlockHeight(isTestnet: boolean): Promise<number> {
    try {
      const explorerUrl = isTestnet 
        ? 'https://api.whatsonchain.com/v1/bsv/test/chain/info'
        : 'https://api.whatsonchain.com/v1/bsv/main/chain/info';
      
      const response = await fetch(explorerUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch block height: ${response.statusText}`);
      }
      
      const info = await response.json();
      return info.blocks || 0;
      
    } catch (error) {
      console.error('Error fetching block height:', error);
      return 0;
    }
  }

  /**
   * Dynamic UTXO selection with multiple algorithms
   */
  private selectUTXOs(utxos: any[], targetAmount: number, feeRate: number, algorithm: 'smallest-first' | 'largest-first' | 'random' = 'smallest-first'): { selected: any[], change: number } {
    if (utxos.length === 0) {
      return { selected: [], change: 0 };
    }

    // Sort UTXOs based on algorithm
    let sortedUtxos = [...utxos];
    switch (algorithm) {
      case 'smallest-first':
        sortedUtxos.sort((a, b) => a.value - b.value);
        break;
      case 'largest-first':
        sortedUtxos.sort((a, b) => b.value - a.value);
        break;
      case 'random':
        sortedUtxos = sortedUtxos.sort(() => Math.random() - 0.5);
        break;
    }

    // Calculate minimum fee (rough estimate)
    const estimatedTxSize = 250; // bytes
    const minFee = feeRate * estimatedTxSize;

    const selected: any[] = [];
    let totalValue = 0;

    // Select UTXOs until we have enough
    for (const utxo of sortedUtxos) {
      selected.push(utxo);
      totalValue += utxo.value;

      // Check if we have enough (including fee)
      if (totalValue >= targetAmount + minFee) {
        break;
      }
    }

    // Calculate change
    const totalFee = feeRate * estimatedTxSize;
    const change = totalValue - targetAmount - totalFee;

    return { selected, change: Math.max(0, change) };
  }


  /**
   * Broadcast transaction using real BSV SDK
   */
  private async broadcastTransaction(transactionHex: string, isTestnet: boolean): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Use real BSV SDK broadcast method
      const broadcastResult = await this.sdk.broadcastTransactionNative(transactionHex);
      
      if (broadcastResult.success && broadcastResult.txid) {
        return {
          success: true,
          transactionId: broadcastResult.txid
        };
      } else {
        return {
          success: false,
          error: broadcastResult.error || 'Transaction broadcast failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get explorer URL for transaction
   */
  private getExplorerUrl(transactionId: string, isTestnet: boolean): string {
    const baseUrl = isTestnet ? 'https://testnet.whatsonchain.com/tx' : 'https://whatsonchain.com/tx';
    return `${baseUrl}/${transactionId}`;
  }
}
