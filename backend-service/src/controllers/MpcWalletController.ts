import { Request, Response } from 'express';
import crypto from 'crypto';
import Wallet from '../models/Wallet';
import { ShardingService } from '../services/ShardingService';
import { EncryptionService, createEncryptionService } from '../services/EncryptionService';
// All blockchain operations are in SDK - no direct @bsv/sdk or axios usage for blockchain calls
import { BSVSDK, EthereumKeyPairManager, EthereumTransactionSigner, BitcoinTransactionSigner, BSVTransactionSigner } from '../../../bsv-sdk/dist/index';

export class MpcWalletController {
  private encryptionService: EncryptionService;

  constructor() {
    try {
      this.encryptionService = createEncryptionService();
    } catch (error) {
      console.warn('MpcWalletController encryption initialization warning:', error instanceof Error ? error.message : 'Unknown error');
      this.encryptionService = createEncryptionService('dummy-key');
    }
  }

  /**
   * Wallet creation (MPC spec)
   * POST /rwcore/api/v1/mpc/wallets/create
   */
  createWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.body;

      if (!wallet_id || typeof wallet_id !== 'string' || !wallet_id.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'wallet_id field is required'
          }]
        });
        return;
      }

      // Validate wallet_id format (per requirement: "wallet id is invalid")
      const trimmedWalletId = wallet_id.trim();
      if (trimmedWalletId.length < 1) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'wallet id is invalid'
          }]
        });
        return;
      }

      const existingWallet = await Wallet.findOne({ walletId: trimmedWalletId });
      if (existingWallet) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'wallet id is invalid'
          }]
        });
        return;
      }

      // Generate MPC wallet with root-level xpub (master key at root "m") per requirements
      const walletData = ShardingService.generateMpcWalletWithShards();
      const xpubHash = crypto.createHash('sha256').update(walletData.xpub).digest('hex');
      const network = process.env.BSV_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

      // Encrypt shard1 and shard2 before storing in database (shard3 remains plain for client)
      const encryptedShard1 = this.encryptionService.encryptShard(walletData.shard1);
      const encryptedShard2 = this.encryptionService.encryptShard(walletData.shard2);

      const wallet = new Wallet({
        walletId: wallet_id.trim(),
        walletType: 'mpc', // Mark as MPC wallet (root-level xpub)
        xpub: walletData.xpub,
        xpubHash,
        network,
        shard1: encryptedShard1, // Encrypted before storage
        shard2: encryptedShard2, // Encrypted before storage
        metadata: {
          deviceId: req.headers['x-rw-device-id'] as string,
          clientId: req.headers['x-rw-client-id'] as string,
          ipAddress: req.ip
        }
      });

      await wallet.save();

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'account xpub generated successfully',
        data: {
          wallet_id: wallet_id.trim(),
          wallet_key: walletData.shard3,
          xpub: walletData.xpub
        }
      });
    } catch (error) {
      console.error('MPC wallet creation error:', error);
      res.status(500).json({
        result: 'error',
        code: 'DB_ERROR',
        msg: 'database error',
        errors: [{
          code: 'DB_CONN_ERROR',
          err_msg: 'unable to connect to database'
        }]
      });
    }
  };

  /**
   * Wallet recovery (MPC spec)
   * POST /rwcore/api/v1/mpc/wallets/recovery
   */
  recoverWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id, xpub_hash } = req.body;

      if (!wallet_id || typeof wallet_id !== 'string' || !wallet_id.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'wallet_id field is required'
          }]
        });
        return;
      }

      if (!xpub_hash || typeof xpub_hash !== 'string' || !xpub_hash.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'xpub_hash field is required'
          }]
        });
        return;
      }

      const normalizedWalletId = wallet_id.trim();
      
      // Validate wallet_id format (per requirement: "wallet id is invalid")
      if (normalizedWalletId.length < 1) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'wallet id is invalid'
          }]
        });
        return;
      }
      const normalizedXpubHash = xpub_hash.trim().toLowerCase();

      const wallet = await Wallet.findOne({ walletId: normalizedWalletId, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found',
          errors: [{
            code: 'WALLET_NOT_FOUND_ERROR',
            err_msg: 'wallet not found'
          }]
        });
        return;
      }

      if (!wallet.xpubHash && wallet.xpub) {
        wallet.xpubHash = crypto.createHash('sha256').update(wallet.xpub).digest('hex');
      }

      if (!wallet.xpubHash || wallet.xpubHash !== normalizedXpubHash) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'xpub_hash is invalid'
          }]
        });
        return;
      }

      const decryptedShard1 = this.decryptShardIfNeeded(wallet.shard1);
      const decryptedShard2 = this.decryptShardIfNeeded(wallet.shard2);

      const mnemonic = ShardingService.recoverMnemonicFromShards(decryptedShard1, decryptedShard2);
      const newShards = ShardingService.createNewShards(mnemonic);

      wallet.shard1 = this.reapplyEncryption(wallet.shard1, newShards.shards[0]);
      wallet.shard2 = this.reapplyEncryption(wallet.shard2, newShards.shards[1]);
      await wallet.save();

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'account xpub generated successfully',
        data: {
          wallet_id: normalizedWalletId,
          wallet_key: newShards.shards[2]
        }
      });
    } catch (error) {
      console.error('MPC wallet recovery error:', error);
      res.status(500).json({
        result: 'error',
        code: 'DB_ERROR',
        msg: 'database error',
        errors: [{
          code: 'DB_CONN_ERROR',
          err_msg: 'unable to connect to database'
        }]
      });
    }
  };

  private decryptShardIfNeeded(shard: string): string {
    if (!shard) {
      throw new Error('Shard data is missing');
    }

    const isEncrypted = this.encryptionService.validateEncryptedShard(shard);
    return isEncrypted ? this.encryptionService.decryptShard(shard) : shard;
  }

  private reapplyEncryption(originalValue: string, plainShard: string): string {
    const wasEncrypted = originalValue ? this.encryptionService.validateEncryptedShard(originalValue) : false;
    return wasEncrypted ? this.encryptionService.encryptShard(plainShard) : plainShard;
  }

  private decryptClientShard(shard: string): string {
    if (!shard || typeof shard !== 'string') {
      throw new Error('wallet_key is required');
    }
    const trimmed = shard.trim();
    const isEncrypted = this.encryptionService.validateEncryptedShard(trimmed);
    return isEncrypted ? this.encryptionService.decryptShard(trimmed) : trimmed;
  }

  // Removed fetchPreviousTransactionHex - all blockchain operations now in SDK
  // BSVTransactionSigner handles all BSV network calls (real mainnet/testnet, no mocks)

  /**
   * Account xpub generation (MPC spec)
   * POST /rwcore/api/v1/mpc/wallets/{wallet_id}/accounts/xpub
   */
  generateAccountXpubs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { wallet_key, accounts } = req.body;

      if (!wallet_id || typeof wallet_id !== 'string' || !wallet_id.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'wallet_id parameter is required'
          }]
        });
        return;
      }

      if (!wallet_key || typeof wallet_key !== 'string' || !wallet_key.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'wallet_key field is required'
          }]
        });
        return;
      }

      if (!Array.isArray(accounts) || accounts.length === 0) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'accounts array is required'
          }]
        });
        return;
      }

      const normalizedWalletId = wallet_id.trim();
      const wallet = await Wallet.findOne({ walletId: normalizedWalletId, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found',
          errors: [{
            code: 'WALLET_NOT_FOUND_ERROR',
            err_msg: 'wallet not found'
          }]
        });
        return;
      }

      const decryptedShard1 = this.decryptShardIfNeeded(wallet.shard1);
      const decryptedShard2 = this.decryptShardIfNeeded(wallet.shard2);
      const clientShard = this.decryptClientShard(wallet_key);

      let mnemonic: string;
      try {
        mnemonic = ShardingService.recoverMnemonicFromShards(decryptedShard1, clientShard);
      } catch (primaryError) {
        try {
          mnemonic = ShardingService.recoverMnemonicFromShards(decryptedShard2, clientShard);
        } catch {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'wallet_key is invalid'
            }]
          });
          return;
        }
      }

      const isTestnet = wallet.network !== 'mainnet';
      const expectedCoinType = isTestnet ? 1 : 236;
      const sdk = new BSVSDK({
        isTestnet,
        maxAddresses: 100000,
        feeRate: 5
      });

      const pathRegex = /^m\/44'\/(\d+)'\/(\d+)'$/;
      const resultAccounts = [];

      for (const account of accounts) {
        if (
          !account ||
          typeof account.account_id !== 'string' ||
          !account.account_id.trim() ||
          typeof account.path !== 'string' ||
          !account.path.trim()
        ) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'each account must include account_id and path'
            }]
          });
          return;
        }

        const path = account.path.trim();
        const match = pathRegex.exec(path);
        if (!match) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: `invalid derivation path format for account_id ${account.account_id}`
            }]
          });
          return;
        }

        const coinType = Number(match[1]);
        const accountIndex = Number(match[2]);
        
        // Allow BSV coin types (1/236), Bitcoin (0), and Ethereum coin type (60)
        // This enables the same wallet to support multiple UTXO_BASED and ACCOUNT_BASED blockchains
        // Per requirement document: BSV (236/1), BTC (0), Ethereum (60)
        const isValidCoinType = !Number.isNaN(coinType) && (coinType === expectedCoinType || coinType === 0 || coinType === 60);
        const isValidAccountIndex = !Number.isNaN(accountIndex) && accountIndex >= 0;
        
        if (!isValidCoinType || !isValidAccountIndex) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: `derivation path coin type or account index is invalid for account_id ${account.account_id}. Supported coin types: ${expectedCoinType} (BSV), 0 (Bitcoin/BTC), or 60 (Ethereum/EVM)`
            }]
          });
          return;
        }
        
        // For Ethereum (coin type 60), generate proper BIP32 xpub at account level
        // This xpub can be used to derive multiple Ethereum addresses
        if (coinType === 60) {
          // Generate proper Ethereum xpub using BIP32 (same as Bitcoin/BSV)
          const ethXPub = EthereumKeyPairManager.generateEthereumXPub(mnemonic, path);
          
          // Return the proper xpub (Base58 format, can derive multiple addresses)
          resultAccounts.push({
            account_id: account.account_id.trim(),
            path,
            xpub: ethXPub.xpub // Proper BIP32 xpub in Base58 format (e.g., xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKp...)
          });
        } else {
          // For BSV/Bitcoin/UTXO-based (coin types 0, 1, 236), generate actual xpub
          // Use the coin type from the derivation path, not the wallet's network coin type
          // This allows the same wallet to support multiple blockchains (BSV, BTC, etc.)
          const xpubInfo = sdk.generateXPubWithCoinType(mnemonic, coinType, accountIndex);
          resultAccounts.push({
            account_id: account.account_id.trim(),
            path,
            xpub: xpubInfo.xpub
          });
        }
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'account xpub generated successfully',
        data: {
          accounts: resultAccounts
        }
      });
    } catch (error) {
      console.error('MPC account xpub generation error:', error);
      res.status(500).json({
        result: 'error',
        code: 'DB_ERROR',
        msg: 'database error',
        errors: [{
          code: 'DB_CONN_ERROR',
          err_msg: 'unable to connect to database'
        }]
      });
    }
  };

  /**
   * Transaction signature (MPC spec - UTXO based)
   * POST /rwcore/api/v1/mpc/wallets/{wallet_id}/transactions/sign
   */
  signTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const {
        tx_id,
        tx_data,
        wallet_key,
        blockchain_type,
        network_fee,
        account_path,
        utxos
      } = req.body;

      if (!wallet_id || typeof wallet_id !== 'string' || !wallet_id.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'wallet_id parameter is required'
          }]
        });
        return;
      }

      if (!tx_id || typeof tx_id !== 'string' || !tx_id.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'tx_id field is required'
          }]
        });
        return;
      }

      // tx_data validation - must be a string (hex for UTXO, JSON string for ACCOUNT_BASED)
      if (!tx_data) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'tx_data field is required'
          }]
        });
        return;
      }

      // Per requirements: tx_data must be a string (unsigned transaction hex)
      // For UTXO_BASED: hex string
      // For ACCOUNT_BASED: JSON string (stringified transaction object)
      if (typeof tx_data !== 'string') {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'tx_data must be a string (hex for UTXO_BASED, JSON string for ACCOUNT_BASED)'
          }]
        });
        return;
      }

      if (!wallet_key || typeof wallet_key !== 'string' || !wallet_key.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'wallet_key field is required'
          }]
        });
        return;
      }

      if (!blockchain_type || typeof blockchain_type !== 'string') {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'blockchain_type field is required'
          }]
        });
        return;
      }

      if (blockchain_type !== 'UTXO_BASED' && blockchain_type !== 'ACCOUNT_BASED') {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'blockchain_type must be either UTXO_BASED or ACCOUNT_BASED'
          }]
        });
        return;
      }

      if (!network_fee || typeof network_fee !== 'number' || network_fee <= 0) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'network_fee must be a positive number'
          }]
        });
        return;
      }

      if (!account_path || typeof account_path !== 'string' || !account_path.trim()) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'account_path field is required'
          }]
        });
        return;
      }

      // Validate blockchain-specific requirements
      let account_chain_details: any = null;
      if (blockchain_type === 'ACCOUNT_BASED') {
        // For ACCOUNT_BASED, account_chain_details is required
        account_chain_details = req.body.account_chain_details;
        if (!account_chain_details || typeof account_chain_details !== 'object') {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'account_chain_details is required for ACCOUNT_BASED blockchain_type'
            }]
          });
          return;
        }

        // Validate account_chain_details fields
        const { address, address_path: addrPath, chain_id } = account_chain_details;
        if (!address || typeof address !== 'string' || !address.trim()) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'account_chain_details.address is required'
            }]
          });
          return;
        }

        if (!EthereumKeyPairManager.isValidEthereumAddress(address.trim())) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'account_chain_details.address must be a valid Ethereum address'
            }]
          });
          return;
        }

        if (!addrPath || typeof addrPath !== 'string' || !addrPath.trim()) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'account_chain_details.address_path is required'
            }]
          });
          return;
        }

        const addressPathRegex = /^\d+\/\d+$/;
        if (!addressPathRegex.test(addrPath.trim())) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'account_chain_details.address_path must be in change/index format (e.g. 0/0)'
            }]
          });
          return;
        }

        if (typeof chain_id !== 'number' || chain_id < 0 || !Number.isInteger(chain_id)) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'account_chain_details.chain_id must be a positive integer'
            }]
          });
          return;
        }
      } else if (blockchain_type === 'UTXO_BASED') {
        // For UTXO_BASED, utxos array is required
        if (!Array.isArray(utxos) || utxos.length === 0) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'utxos array is required for UTXO_BASED signing'
            }]
          });
          return;
        }
      }

      const normalizedWalletId = wallet_id.trim();
      const wallet = await Wallet.findOne({ walletId: normalizedWalletId, isActive: true });
      if (!wallet) {
        res.status(404).json({
          result: 'error',
          code: 'WALLET_NOT_FOUND',
          msg: 'wallet not found',
          errors: [{
            code: 'WALLET_NOT_FOUND_ERROR',
            err_msg: 'wallet not found'
          }]
        });
        return;
      }

      // Validate account_path based on blockchain_type
      const accountPathRegex = /^m\/44'\/(\d+)'\/(\d+)'$/;
      const accountMatch = accountPathRegex.exec(account_path.trim());
      if (!accountMatch) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'account id is invalid'
          }]
        });
        return;
      }

      const coinType = Number(accountMatch[1]);
      const accountIndex = Number(accountMatch[2]);
      const isTestnet = wallet.network !== 'mainnet';

      // Validate coin type based on blockchain_type
      // Per requirement: "account id is invalid" error message
      // Per requirement document: UTXO_BASED supports BSV (236/1) and BTC (0)
      if (blockchain_type === 'UTXO_BASED') {
        const expectedCoinType = isTestnet ? 1 : 236;
        // Allow BSV coin types (1/236) and Bitcoin (0) for UTXO_BASED
        // Per requirement: "like BSV, BTC.." (line 844)
        const isValidUtxoCoinType = coinType === expectedCoinType || coinType === 0;
        if (!isValidUtxoCoinType || Number.isNaN(accountIndex) || accountIndex < 0) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'account id is invalid'
            }]
          });
          return;
        }
      } else if (blockchain_type === 'ACCOUNT_BASED') {
        // Ethereum uses coin type 60
        if (coinType !== 60 || Number.isNaN(accountIndex) || accountIndex < 0) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'account id is invalid'
            }]
          });
          return;
        }
      }

      const decryptedShard1 = this.decryptShardIfNeeded(wallet.shard1);
      const decryptedShard2 = this.decryptShardIfNeeded(wallet.shard2);
      const clientShard = this.decryptClientShard(wallet_key);

      let mnemonic: string;
      try {
        mnemonic = ShardingService.recoverMnemonicFromShards(decryptedShard1, clientShard);
      } catch (primaryError) {
        try {
          mnemonic = ShardingService.recoverMnemonicFromShards(decryptedShard2, clientShard);
        } catch {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'wallet_key is invalid'
            }]
          });
          return;
        }
      }

      // Handle ACCOUNT_BASED blockchain transactions
      if (blockchain_type === 'ACCOUNT_BASED') {
        try {
          // Derive Ethereum address from mnemonic using SDK
          const ethKeyPair = EthereumKeyPairManager.deriveEthereumAddress(
            mnemonic,
            account_path.trim(),
            account_chain_details.address_path.trim()
          );

          // Validate derived address matches provided address
          if (ethKeyPair.address.toLowerCase() !== account_chain_details.address.trim().toLowerCase()) {
            res.status(400).json({
              result: 'error',
              code: 'VALIDATION_ERROR',
              msg: 'validation error',
              errors: [{
                code: 'INVALID_INPUT_ERROR',
                err_msg: 'derived address does not match provided address in account_chain_details'
              }]
            });
            return;
          }

          let tx_data_hex = Buffer.from(tx_data, 'base64').toString('hex');
          tx_data_hex = tx_data_hex.startsWith('0x') ? tx_data_hex : `0x${tx_data_hex}`
          
          // Parse transaction data - tx_data is always a string per requirements
          // For ACCOUNT_BASED, it should be RLP-encoded unsigned transaction hex
          // Validate hex format
          const trimmedHex = tx_data_hex.trim();
          if (!trimmedHex || trimmedHex.length < 20) {
            res.status(400).json({
              result: 'error',
              code: 'VALIDATION_ERROR',
              msg: 'validation error',
              errors: [{
                code: 'INVALID_INPUT_ERROR',
                err_msg: 'tx_data must be RLP-encoded unsigned transaction hex for ACCOUNT_BASED transactions'
              }]
            });
            return;
          }

          // Sign Ethereum transaction using SDK
          // SDK will parse RLP-encoded hex and sign it
          const signingResult = await EthereumTransactionSigner.signTransaction(
            trimmedHex, // Pass hex string directly
            ethKeyPair.privateKey,
            account_chain_details.chain_id
          );
          
          const signedTxHex = signingResult.signedTransactionHex;

          res.status(200).json({
            result: 'success',
            code: 'RW_SUCCESS',
            msg: 'transaction signed successfully',
            data: {
              tx_id: tx_id.trim(),
              tx_data: signedTxHex
            }
          });
          return;
        } catch (error) {
          console.error('ACCOUNT_BASED transaction signing error:', error);
          res.status(500).json({
            result: 'error',
            code: 'DB_ERROR',
            msg: 'database error',
            errors: [{
              code: 'DB_CONN_ERROR',
              err_msg: error instanceof Error ? error.message : 'unable to sign transaction'
            }]
          });
          return;
        }
      }

      // Handle UTXO_BASED blockchain transactions
      // All blockchain operations are in SDK - no direct @bsv/sdk usage in backend
      // Determine if this is Bitcoin (coin type 0) or BSV (coin type 236/1)
      const isBitcoin = coinType === 0;
      
      if (typeof tx_data !== 'string') {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'tx_data must be a hex string for UTXO_BASED transactions'
          }]
        });
        return;
      }

      // Validate UTXOs
      if (!Array.isArray(utxos) || utxos.length === 0) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_INPUT_ERROR',
            err_msg: 'utxos array is required for UTXO_BASED signing'
          }]
        });
        return;
      }

      const addressPathRegex = /^\d+\/\d+$/;
      const sdk = new BSVSDK({
        isTestnet,
        maxAddresses: 100000,
        feeRate: network_fee
      });

      // Derive private keys for all UTXOs
      const privateKeys: string[] = [];
      for (let i = 0; i < utxos.length; i++) {
        const utxo = utxos[i];
        if (
          !utxo ||
          typeof utxo.tx_hash !== 'string' ||
          !utxo.tx_hash.trim() ||
          typeof utxo.vout !== 'number' ||
          utxo.vout < 0 ||
          typeof utxo.value !== 'number' ||
          utxo.value <= 0 ||
          typeof utxo.address_path !== 'string' ||
          !utxo.address_path.trim()
        ) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'Each utxo must include tx_hash, vout, value, and address_path'
            }]
          });
          return;
        }

        const addressPath = utxo.address_path.trim();
        if (!addressPathRegex.test(addressPath)) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: `address_path must be in change/index format (e.g. 0/0) for utxo ${i}`
            }]
          });
          return;
        }

        const fullPath = `${account_path.trim()}/${addressPath}`;
        const keypair = sdk.generateKeyPairAtPath(mnemonic, fullPath, 'p2pkh');
        privateKeys.push(keypair.privateKey);
      }

      // Use SDK for transaction signing - all blockchain operations in SDK
      let signedHex: string;
      if (isBitcoin) {
        // Bitcoin (BTC) - use SDK BitcoinTransactionSigner (real mainnet)
        const bitcoinParams = {
          unsignedTxHex: tx_data.trim(),
          utxos: utxos.map(utxo => ({
            tx_hash: utxo.tx_hash.trim(),
            vout: utxo.vout,
            script_pub_key_hex: typeof utxo.script_pub_key_hex === 'string' ? utxo.script_pub_key_hex.trim() : '',
            value: utxo.value
          })),
          privateKeys,
          isMainnet: !isTestnet, // Bitcoin mainnet (coin type 0 is always mainnet)
          rpcUrl: process.env.BTC_RPC_URL // Optional custom BTC RPC URL
        };

        const bitcoinResult = await BitcoinTransactionSigner.signTransaction(bitcoinParams);
        signedHex = bitcoinResult.signedTransactionHex;
      } else {
        // BSV - use SDK BSVTransactionSigner (real mainnet/testnet, no mocks)
        // All blockchain operations are in SDK - no direct @bsv/sdk usage
        const bsvParams = {
          unsignedTxHex: tx_data.trim(),
          utxos: utxos.map(utxo => ({
            tx_hash: utxo.tx_hash.trim(),
            vout: utxo.vout,
            script_pub_key_hex: typeof utxo.script_pub_key_hex === 'string' ? utxo.script_pub_key_hex.trim() : undefined,
            value: utxo.value
          })),
          privateKeys,
          isTestnet,
          rpcUrl: process.env.BSV_RPC_URL // Optional custom BSV RPC URL
        };

        const bsvResult = await BSVTransactionSigner.signTransaction(bsvParams);
        signedHex = bsvResult.signedTransactionHex;
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction signed successfully',
        data: {
          tx_id: tx_id.trim(),
          tx_data: signedHex
        }
      });
    } catch (error) {
      console.error('MPC transaction signing error:', error);
      
      // Determine appropriate error code and message based on error type
      let errorCode = 'INTERNAL_ERROR';
      let errorMsg = 'internal server error';
      let errorDetail = error instanceof Error ? error.message : 'Unknown error';
      let statusCode = 500;
      
      // Check for specific error types
      if (errorDetail.includes('Invalid unsigned transaction hex') || 
          errorDetail.includes('Number can only safely store') ||
          errorDetail.includes('transaction hex')) {
        errorCode = 'VALIDATION_ERROR';
        errorMsg = 'validation error';
        statusCode = 400;
        errorDetail = 'tx_data is invalid or malformed';
      } else if (errorDetail.includes('UTXOs count') || 
                 errorDetail.includes('Private keys count') ||
                 errorDetail.includes('Invalid UTXO')) {
        errorCode = 'VALIDATION_ERROR';
        errorMsg = 'validation error';
        statusCode = 400;
      } else if (errorDetail.includes('Failed to fetch') || 
                 errorDetail.includes('network') ||
                 errorDetail.includes('timeout')) {
        errorCode = 'NETWORK_ERROR';
        errorMsg = 'network error';
        statusCode = 500;
      } else if (errorDetail.includes('wallet not found') || 
                 errorDetail.includes('Wallet not found')) {
        errorCode = 'WALLET_NOT_FOUND';
        errorMsg = 'wallet not found';
        statusCode = 404;
        errorDetail = 'wallet not found';
      }
      
      res.status(statusCode).json({
        result: 'error',
        code: errorCode,
        msg: errorMsg,
        errors: [{
          code: errorCode === 'VALIDATION_ERROR' ? 'INVALID_INPUT_ERROR' : 
                errorCode === 'NETWORK_ERROR' ? 'NETWORK_CONNECTION_ERROR' :
                errorCode === 'WALLET_NOT_FOUND' ? 'WALLET_NOT_FOUND_ERROR' :
                'INTERNAL_SERVER_ERROR',
          err_msg: errorDetail
        }]
      });
    }
  };
}

