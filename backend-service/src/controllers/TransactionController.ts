import { Request, Response } from 'express';
import { ShardingService } from '../services/ShardingService';
import { BSVService } from '../services/BSVService';
import Wallet from '../models/Wallet';
import User from '../models/User';
import { BSVSDK } from '../../../bsv-sdk/dist/index';
import { createEncryptionService, EncryptionService } from '../services/EncryptionService';

export class TransactionController {
  private bsvService: BSVService;
  private encryptionService: EncryptionService;

  constructor(encryptionKey?: string) {
    this.bsvService = new BSVService(process.env.BSV_NETWORK === 'testnet');
    // Allow injection of encryption key for testing
    try {
      this.encryptionService = createEncryptionService(encryptionKey);
    } catch (error) {
      console.warn('EncryptionService initialization warning:', error instanceof Error ? error.message : 'Unknown error');
      // Create a dummy instance for type compatibility (will throw on actual use)
      this.encryptionService = createEncryptionService('dummy-key-for-initialization');
    }
  }

  /**
   * Sign transaction endpoint
   * POST /api/v1/wallets/{wallet_id}/transactions/sign
   * Uses 1 shard from database + 1 from request body
   */
  signTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { 
        fromAddress, 
        toAddress, 
        amount, 
        shard3, 
        feeRate,
        changeAddress 
      } = req.body;

      // Validate required fields
      if (!fromAddress || !toAddress || !amount || !shard3) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'fromAddress, toAddress, amount, and shard3 fields are required'
          }]
        });
        return;
      }

      // Find wallet
      const wallet = await Wallet.findOne({ walletId: wallet_id, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found'
        });
        return;
      }

      // Validate shard format
      if (!ShardingService.validateShard(shard3)) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_SHARD_ERROR',
            err_msg: 'invalid shard format'
          }]
        });
        return;
      }

      // Recover mnemonic from shards (use shard1 from DB + shard3 from request)
      const mnemonic = ShardingService.recoverMnemonicFromShards(
        wallet.shard1, // From database
        shard3 // From request
      );

      // Generate private key for the from address
      // In a real implementation, you'd derive the specific private key for the address
      const keypair = this.bsvService.generateKeypairFromMnemonic(mnemonic, 0);

      // Validate address matches
      if (keypair.address !== fromAddress) {
        res.status(400).json({
          result: 'error',
          code: 'ADDRESS_MISMATCH',
          msg: 'address mismatch',
          errors: [{
            code: 'ADDRESS_MISMATCH_ERROR',
            err_msg: 'provided address does not match derived address'
          }]
        });
        return;
      }

      // Sign transaction
      const signedTx = await this.bsvService.signTransaction({
        fromAddress,
        toAddress,
        amount,
        privateKey: keypair.privateKey,
        feeRate: feeRate || 5,
        changeAddress
      });

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction signed successfully',
        data: {
          signed_transaction_hex: signedTx.signedTransactionHex,
          transaction_id: signedTx.transactionId,
          fee: signedTx.fee,
          inputs: signedTx.inputs,
          outputs: signedTx.outputs,
          amount_bsv: signedTx.amountBSV,
          from_address: fromAddress,
          to_address: toAddress,
          amount: amount
        }
      });

    } catch (error) {
      console.error('Error signing transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'TRANSACTION_SIGNING_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Sign token transaction endpoint - DISABLED: Only native BSV supported
   * POST /api/v1/wallets/{wallet_id}/transactions/sign-token
   */
  signTokenTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { 
        fromAddress, 
        toAddress, 
        tokenId, 
        amount, 
        shard3, 
        feeRate,
        changeAddress 
      } = req.body;

      // Token transactions are not supported - only native BSV
        res.status(400).json({
          result: 'error',
        code: 'NOT_SUPPORTED',
        msg: 'token transactions not supported',
          errors: [{
          code: 'FEATURE_NOT_SUPPORTED',
          err_msg: 'This service only supports native BSV transactions. Token transactions are not available.'
          }]
        });
        return;

      // Find wallet
      const wallet = await Wallet.findOne({ walletId: wallet_id, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found'
        });
        return;
      }

      // Validate shard format
      if (!ShardingService.validateShard(shard3)) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_SHARD_ERROR',
            err_msg: 'invalid shard format'
          }]
        });
        return;
      }

      // Recover mnemonic from shards
      const mnemonic = ShardingService.recoverMnemonicFromShards(
        wallet.shard1, // From database
        shard3 // From request
      );

      // Generate private key
      const keypair = this.bsvService.generateKeypairFromMnemonic(mnemonic, 0);

      // Validate address matches
      if (keypair.address !== fromAddress) {
        res.status(400).json({
          result: 'error',
          code: 'ADDRESS_MISMATCH',
          msg: 'address mismatch',
          errors: [{
            code: 'ADDRESS_MISMATCH_ERROR',
            err_msg: 'provided address does not match derived address'
          }]
        });
        return;
      }

      // Sign token transaction
      const signedTx = await this.bsvService.signTokenTransaction({
        fromAddress,
        toAddress,
        tokenId,
        amount,
        privateKey: keypair.privateKey,
        feeRate: feeRate || 5,
        changeAddress
      });

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'token transaction signed successfully',
        data: {
          signed_transaction_hex: signedTx.signedTransactionHex,
          transaction_id: signedTx.transactionId,
          fee: signedTx.fee,
          inputs: signedTx.inputs,
          outputs: signedTx.outputs,
          token_amount: signedTx.tokenAmount,
          token_id: tokenId,
          from_address: fromAddress,
          to_address: toAddress,
          amount: amount
        }
      });

    } catch (error) {
      console.error('Error signing token transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'TOKEN_TRANSACTION_SIGNING_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Broadcast transaction endpoint
   * POST /api/v1/wallets/{wallet_id}/transactions/broadcast
   */
  broadcastTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { signed_transaction_hex } = req.body;

      // Validate required fields
      if (!signed_transaction_hex) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'signed_transaction_hex field is required'
          }]
        });
        return;
      }

      // Broadcast transaction to BSV network using real SDK
      const isTestnet = process.env.BSV_NETWORK !== 'mainnet';
      const broadcastResult = await this.bsvService.broadcastTransactionNative(signed_transaction_hex);

      if (!broadcastResult.success) {
        res.status(500).json({
          result: 'error',
          code: 'BROADCAST_ERROR',
          msg: 'transaction broadcast failed',
          errors: [{
            code: 'BROADCAST_FAILED_ERROR',
            err_msg: broadcastResult.error || 'Failed to broadcast transaction'
          }]
        });
        return;
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction broadcast successfully',
        data: {
          transaction_id: broadcastResult.txid,
          signed_transaction_hex: signed_transaction_hex,
          explorer_url: this.bsvService.getExplorerUrl(broadcastResult.txid!),
          status: 'broadcasted'
        }
      });

    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'TRANSACTION_BROADCAST_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Sync transactions endpoint
   * GET /api/v1/wallets/{wallet_id}/transactions/sync
   */
  syncTransactions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;

      // Validate wallet exists
      const wallet = await Wallet.findOne({ walletId: wallet_id, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found'
        });
        return;
      }

      // In a real implementation, you would sync transactions from the blockchain
      // For now, we'll return a success response

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction sync successful',
        data: {
          wallet_id: wallet_id,
          synced_at: new Date().toISOString(),
          status: 'synced'
        }
      });

    } catch (error) {
      console.error('Error syncing transactions:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Get transaction info
   * GET /api/v1/wallets/{wallet_id}/transactions/{tx_id}
   */
  getTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id, tx_id } = req.params;

      // Validate wallet exists
      const wallet = await Wallet.findOne({ walletId: wallet_id, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found'
        });
        return;
      }

      // Fetch real transaction details from blockchain
      const isTestnet = process.env.BSV_NETWORK !== 'mainnet';
      const txInfo = await this.bsvService.getTransaction(tx_id);

      if (!txInfo) {
        res.status(404).json({
          result: 'error',
          code: 'TRANSACTION_NOT_FOUND',
          msg: 'transaction not found'
        });
        return;
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          transaction_id: tx_id,
          wallet_id: wallet_id,
          explorer_url: this.bsvService.getExplorerUrl(tx_id),
          status: txInfo.confirmations > 0 ? 'confirmed' : 'pending',
          confirmations: txInfo.confirmations || 0,
          block_height: txInfo.blockHeight,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Sign transaction endpoint (User-based)
   * POST /api/v1/users/transactions/sign
   * Uses JWT authentication and account_index to identify account/address
   */
  signTransactionForUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get user from JWT (set by authenticateJWT middleware)
      if (!req.user) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const { 
        account_index,  // 0 = saving, 1 = current
        toAddress, 
        amount, 
        shard3, 
        feeRate,
        changeAddress 
      } = req.body;

      // Validate required fields
      if (account_index === undefined || !toAddress || !amount || !shard3) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'account_index, toAddress, amount, and shard3 fields are required'
          }]
        });
        return;
      }

      // Validate account_index
      if (account_index !== 0 && account_index !== 1) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_ACCOUNT_INDEX_ERROR',
            err_msg: 'account_index must be 0 (saving) or 1 (current)'
          }]
        });
        return;
      }

      // Find user from JWT data
      const user = await User.findOne({
        userId: req.user.userId,
        isActive: true
      });

      if (!user) {
        res.status(404).json({
          result: 'error',
          code: 'USER_NOT_FOUND',
          msg: 'user not found',
          errors: [{
            code: 'USER_NOT_FOUND_ERROR',
            err_msg: 'user not found'
          }]
        });
        return;
      }

      // Find account by account_index
      const account = user.accounts.find(acc => acc.accountIndex === account_index);
      if (!account) {
        res.status(404).json({
          result: 'error',
          code: 'ACCOUNT_NOT_FOUND',
          msg: 'account not found',
          errors: [{
            code: 'ACCOUNT_NOT_FOUND_ERROR',
            err_msg: `account with index ${account_index} not found`
          }]
        });
        return;
      }

      // Get fromAddress from account (address_index 0)
      const fromAddress = account.address.address;
      
      // Debug: Log account and address info
      console.log(`[Transaction Sign] User: ${user.username}, Account Index: ${account_index}, Address: ${fromAddress}, Network: ${user.network}`);

      // Validate encrypted shard format (check if it's encrypted)
      const isEncrypted = this.encryptionService.validateEncryptedShard(shard3);
      if (!isEncrypted && !ShardingService.validateShard(shard3)) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_SHARD_ERROR',
            err_msg: 'invalid shard format (must be encrypted or valid hex)'
          }]
        });
        return;
      }

      // Decrypt shards (trim whitespace that might come from JSON parsing)
      let decryptedShard3: string;
      const trimmedShard3 = shard3.trim();
      
      if (isEncrypted) {
        try {
          // Only log sensitive info in development mode
          if (process.env.NODE_ENV === 'development') {
            const envKey = process.env.SHARD_ENCRYPTION_KEY;
            if (envKey) {
              console.log(`[Transaction Sign] Using encryption key from env (length: ${envKey.length})`);
            } else {
              console.error('[Transaction Sign] WARNING: SHARD_ENCRYPTION_KEY not found in environment!');
            }
            console.log(`[Transaction Sign] Attempting to decrypt shard3 (length: ${trimmedShard3.length})`);
          }
          
          decryptedShard3 = this.encryptionService.decryptShard(trimmedShard3);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Transaction Sign] ✓ Shard3 decrypted successfully`);
          }
        } catch (error) {
          console.error('[Transaction Sign] ✗ Decryption failed:', error instanceof Error ? error.message : 'Unknown error');
          if (process.env.NODE_ENV === 'development') {
            console.error('[Transaction Sign] Decryption error details:', {
              errorType: error instanceof Error ? error.constructor.name : typeof error,
              errorMessage: error instanceof Error ? error.message : String(error),
              shard3Length: trimmedShard3.length,
              envKeyExists: !!process.env.SHARD_ENCRYPTION_KEY,
              envKeyLength: process.env.SHARD_ENCRYPTION_KEY?.length || 0
            });
          }
          res.status(400).json({
            result: 'error',
            code: 'DECRYPTION_ERROR',
            msg: 'failed to decrypt shard',
            errors: [{
              code: 'SHARD_DECRYPTION_ERROR',
              err_msg: 'Failed to decrypt shard3. Please ensure you are using the correct encrypted shard from the reshard script output.'
            }]
          });
          return;
        }
      } else {
        // Plain shard
        decryptedShard3 = trimmedShard3;
      }

      // Decrypt shard1 from database
      let decryptedShard1: string;
      try {
        decryptedShard1 = this.encryptionService.decryptShard(user.shard1);
      } catch (error) {
        res.status(500).json({
          result: 'error',
          code: 'DECRYPTION_ERROR',
          msg: 'failed to decrypt database shard',
          errors: [{
            code: 'DB_SHARD_DECRYPTION_ERROR',
            err_msg: 'Failed to decrypt shard from database. This may indicate a configuration issue.'
          }]
        });
        return;
      }

      // Recover mnemonic from decrypted shards (use shard1 from DB + shard3 from request)
      // Note: We use shard1 and shard3 for 2-of-3 recovery
      const mnemonic = ShardingService.recoverMnemonicFromShards(
        decryptedShard1, // Decrypted from database
        decryptedShard3 // Decrypted from request
      );

      // Generate private key for the account
      // account_index 0 = saving = m/44'/1'/0'
      // account_index 1 = current = m/44'/1'/1'
      const isTestnet = user.network !== 'mainnet';
      
      // Create BSVService with user's network
      const bsvService = new BSVService(isTestnet);
      
      const sdk = new BSVSDK({
        isTestnet: isTestnet,
        maxAddresses: 100000,
        feeRate: feeRate || 5
      });

      // Derive keypair using account_index as BIP44 account: m/44'/(coin)'/{account_index}'/0/0
      const coinType = isTestnet ? 1 : 236;
      const derivationPath = `m/44'/${coinType}'/${account_index}'/0/0`;
      const keypair = sdk.generateKeyPairAtPath(mnemonic, derivationPath, 'p2pkh');

      // Validate address matches
      if (keypair.address !== fromAddress) {
        res.status(400).json({
          result: 'error',
          code: 'ADDRESS_MISMATCH',
          msg: 'address mismatch',
          errors: [{
            code: 'ADDRESS_MISMATCH_ERROR',
            err_msg: 'derived address does not match account address'
          }]
        });
        return;
      }

      // Debug: Check balance before signing with detailed UTXO info
      try {
        const balanceCheck = await bsvService.getNativeBalance(fromAddress);
        console.log(`[Transaction Sign] Balance Check - Address: ${fromAddress}`);
        console.log(`[Transaction Sign]   Confirmed: ${balanceCheck.confirmed} satoshis (${(balanceCheck.confirmed / 100000000).toFixed(8)} BSV)`);
        console.log(`[Transaction Sign]   Unconfirmed: ${balanceCheck.unconfirmed} satoshis`);
        console.log(`[Transaction Sign]   Total UTXOs: ${balanceCheck.utxos}`);
        console.log(`[Transaction Sign]   Network: ${user.network}, isTestnet: ${isTestnet}`);
        
        // Also fetch raw UTXOs for debugging
        const { UTXOManager } = await import('../../../bsv-sdk/dist/index');
        const utxos = await UTXOManager.getUTXOs(fromAddress, isTestnet);
        console.log(`[Transaction Sign]   Raw UTXOs fetched: ${utxos.length}`);
        utxos.forEach((utxo, idx) => {
          console.log(`[Transaction Sign]     UTXO ${idx + 1}: ${utxo.satoshis} satoshis, height: ${utxo.height}, confirmations: ${utxo.confirmations}`);
        });
      } catch (balanceErr) {
        console.error(`[Transaction Sign] Error checking balance:`, balanceErr);
        console.error(`[Transaction Sign] Balance error details:`, balanceErr instanceof Error ? balanceErr.message : balanceErr);
      }

      // Sign transaction using BSVService with correct network
      const signedTx = await bsvService.signTransaction({
        fromAddress,
        toAddress,
        amount,
        privateKey: keypair.privateKey,
        feeRate: feeRate || 5,
        changeAddress: changeAddress || fromAddress
      });

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction signed successfully',
        data: {
          signed_transaction_hex: signedTx.signedTransactionHex,
          transaction_id: signedTx.transactionId,
          fee: signedTx.fee,
          inputs: signedTx.inputs,
          outputs: signedTx.outputs,
          amount_bsv: signedTx.amountBSV,
          from_address: fromAddress,
          to_address: toAddress,
          amount: amount,
          account_index: account_index,
          account_type: account.accountType
        }
      });

    } catch (error) {
      console.error('Error signing transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'TRANSACTION_SIGNING_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Broadcast transaction endpoint (User-based)
   * POST /api/v1/users/transactions/broadcast
   */
  broadcastTransactionForUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { rawTx } = req.body;

      // Validate required fields
      if (!rawTx || typeof rawTx !== 'string') {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'rawTx field is required'
          }]
        });
        return;
      }
      // Normalize and validate hex (strip whitespace, trailing punctuation)
      const normalizedHex = String(rawTx).trim().replace(/[\s\n\r]+/g, '').replace(/[\.]$/g, '');
      const isHex = /^[0-9a-fA-F]+$/.test(normalizedHex) && normalizedHex.length % 2 === 0;
      if (!isHex) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_RAW_TX_HEX',
            err_msg: 'rawTx must be even-length hex without trailing punctuation'
          }]
        });
        return;
      }

      // Determine network base from env
      const base = process.env.BSV_RPC_URL || (process.env.BSV_NETWORK === 'mainnet'
        ? 'https://api.whatsonchain.com/v1/bsv/main'
        : 'https://api.whatsonchain.com/v1/bsv/test');

      const url = `${base.replace(/\/$/, '')}/tx/raw`;

      const axios = (await import('axios')).default;
      const response = await axios.post(url, { txhex: normalizedHex }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
      const txid = typeof response.data === 'string' ? response.data.replace(/\"/g, '').replace(/"/g, '') : String(response.data);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction broadcast successfully',
        data: {
          transaction_id: txid,
          rawTx: normalizedHex,
          explorer_url: this.bsvService.getExplorerUrl(txid),
          status: 'broadcasted'
        }
      });

    } catch (error) {
      // Extract remote response if present for better diagnostics
      const status = (error as any)?.response?.status;
      const body = (error as any)?.response?.data;
      const details = typeof body === 'string' ? body : (body ? JSON.stringify(body) : undefined);
      console.error('Error broadcasting transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'TRANSACTION_BROADCAST_ERROR',
          err_msg: status ? `WOC ${status}${details ? `: ${details}` : ''}` : (error instanceof Error ? error.message : 'Unknown error')
        }]
      });
    }
  };

  /**
   * Sync transactions endpoint (User-based)
   * POST /api/v1/users/transactions/sync
   */
  syncTransactionsForUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get user from JWT (set by authenticateJWT middleware)
      if (!req.user) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      // Find user from JWT data
      const user = await User.findOne({
        userId: req.user.userId,
        isActive: true
      });

      if (!user) {
        res.status(404).json({
          result: 'error',
          code: 'USER_NOT_FOUND',
          msg: 'user not found'
        });
        return;
      }

      // In a real implementation, you would sync transactions from the blockchain
      // For now, we'll return a success response

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction sync successful',
        data: {
          user_id: user.userId,
          wallet_id: user.walletId,
          synced_at: new Date().toISOString(),
          status: 'synced'
        }
      });

    } catch (error) {
      console.error('Error syncing transactions:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Get transaction info (User-based)
   * GET /api/v1/users/transactions/{tx_id}
   */
  getTransactionForUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get user from JWT (set by authenticateJWT middleware)
      if (!req.user) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const { tx_id } = req.params;

      // Find user from JWT data
      const user = await User.findOne({
        userId: req.user.userId,
        isActive: true
      });

      if (!user) {
        res.status(404).json({
          result: 'error',
          code: 'USER_NOT_FOUND',
          msg: 'user not found'
        });
        return;
      }

      // Fetch real transaction details from blockchain
      const txInfo = await this.bsvService.getTransaction(tx_id);

      if (!txInfo) {
        res.status(404).json({
          result: 'error',
          code: 'TRANSACTION_NOT_FOUND',
          msg: 'transaction not found'
        });
        return;
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          transaction_id: tx_id,
          user_id: user.userId,
          wallet_id: user.walletId,
          explorer_url: this.bsvService.getExplorerUrl(tx_id),
          status: txInfo.confirmations && txInfo.confirmations > 0 ? 'confirmed' : 'pending',
          confirmations: txInfo.confirmations || 0,
          block_height: txInfo.blockHeight,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting transaction:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };
}

// Export factory function for testing
export function createTransactionController(encryptionKey?: string): TransactionController {
  return new TransactionController(encryptionKey);
}

// Export services for testing
export { EncryptionService, createEncryptionService } from '../services/EncryptionService';
