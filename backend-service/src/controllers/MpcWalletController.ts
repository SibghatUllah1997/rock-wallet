import { Request, Response } from 'express';
import crypto from 'crypto';
import Wallet from '../models/Wallet';
import { ShardingService } from '../services/ShardingService';
import { EncryptionService, createEncryptionService } from '../services/EncryptionService';
// All blockchain operations are in SDK - no direct @bsv/sdk or axios usage for blockchain calls
import { BSVSDK, EthereumKeyPairManager, EthereumTransactionSigner, BitcoinTransactionSigner, BSVTransactionSigner, detectTxType, isAllowedProtocol, getLockingScriptType } from '../../../bsv-sdk/dist/index';
import { LockingScript } from '@bsv/sdk';

// MNEE: transfer() creates cosigned tx; submitRawTx adds cosigner for pre-built tx.
let MneeClass: new (config: { environment: string; apiKey?: string }) => {
  transfer: (recipients: Array<{ address: string; amount: number }>, wif: string, opts?: { broadcast?: boolean }) => Promise<{ rawtx?: string; rawTx?: string }>;
  submitRawTx: (hex: string, opts?: { broadcast?: boolean }) => Promise<{ rawtx?: string; rawTx?: string; ticketId?: string }>;
};
try {
  const mneeModule = require('@mnee/ts-sdk');
  MneeClass = typeof mneeModule.default === 'function' ? mneeModule.default : mneeModule;
} catch {
  MneeClass = null as any;
}

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
          xpub: walletData.xpub,
          xpub_hash: xpubHash
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

      // Use stored xpubHash or compute from xpub (legacy wallets may not have xpubHash)
      const storedHash = (wallet.xpubHash || '').trim().toLowerCase();
      const computedFromXpub = wallet.xpub
        ? crypto.createHash('sha256').update(wallet.xpub).digest('hex').toLowerCase()
        : '';
      const isValidHash =
        (storedHash && storedHash === normalizedXpubHash) ||
        (computedFromXpub && computedFromXpub === normalizedXpubHash);

      if (!isValidHash) {
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
        const btcTestnetEnabled = process.env.BTCTESTNET === 'true';

        // Allow BSV coin types (1/236), Bitcoin (0), optionally BTC testnet (1) when BTCTESTNET=true, and Ethereum (60)
        // MPC only: when BTCTESTNET=true support BTC testnet (coin type 1); otherwise mainnet only
        const allowBtcTestnetCoinType = coinType === 1 && (expectedCoinType === 1 || btcTestnetEnabled);
        const isValidCoinType = !Number.isNaN(coinType) && (coinType === expectedCoinType || coinType === 0 || coinType === 60 || allowBtcTestnetCoinType);
        const isValidAccountIndex = !Number.isNaN(accountIndex) && accountIndex >= 0;

        const supportedCoinTypesDesc = btcTestnetEnabled
          ? `${expectedCoinType} (BSV), 0 (Bitcoin/BTC mainnet), 1 (BTC testnet), or 60 (Ethereum/EVM)`
          : `${expectedCoinType} (BSV), 0 (Bitcoin/BTC), or 60 (Ethereum/EVM)`;

        if (!isValidCoinType || !isValidAccountIndex) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: `derivation path coin type or account index is invalid for account_id ${account.account_id}. Supported coin types: ${supportedCoinTypesDesc}`
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
        utxos,
        mnee_recipients,
        tx_type: requestedTxType,
        sign_outputs: signOutputsReq,
        anyone_can_pay: anyoneCanPayReq
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

      // tx_data validation - must be a string (hex for UTXO, JSON string for ACCOUNT_BASED). Optional when mnee_recipients is used (MNEE create-and-hold flow).
      const useMneeTransfer = blockchain_type === 'UTXO_BASED' && Array.isArray(mnee_recipients) && mnee_recipients.length > 0 &&
        mnee_recipients.every((r: any) => r && typeof r.address === 'string' && r.address.trim() && typeof r.amount === 'number' && r.amount > 0);
      if (!tx_data && !useMneeTransfer) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'tx_data field is required (or use mnee_recipients for MNEE create-and-hold)'
          }]
        });
        return;
      }

      // Per requirements: tx_data must be a string (unsigned transaction hex)
      // For UTXO_BASED: hex string. For ACCOUNT_BASED: JSON string.
      // Skip when mnee_recipients is used (MNEE create-and-hold flow; no tx_data).
      if (!useMneeTransfer && typeof tx_data !== 'string') {
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
        // For UTXO_BASED, utxos array is required unless using mnee_recipients (MNEE create-and-hold flow)
        if (!useMneeTransfer && (!Array.isArray(utxos) || utxos.length === 0)) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'REQUIRED_FIELD_MISSING_ERROR',
              err_msg: 'utxos array is required for UTXO_BASED signing (or use mnee_recipients for MNEE)'
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
      // Per requirement document: UTXO_BASED supports BSV (236/1) and BTC (0); BTC testnet (1) when BTCTESTNET=true
      if (blockchain_type === 'UTXO_BASED') {
        const expectedCoinType = isTestnet ? 1 : 236;
        const btcTestnetEnabled = process.env.BTCTESTNET === 'true';
        // Allow BSV coin types (1/236), Bitcoin mainnet (0), and optionally BTC testnet (1) when BTCTESTNET=true
        const isValidUtxoCoinType = coinType === expectedCoinType || coinType === 0 || (coinType === 1 && btcTestnetEnabled);
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
      // Determine if this is Bitcoin (coin type 0 = mainnet, or coin type 1 = testnet when BTCTESTNET=true) or BSV (coin type 236/1)
      const btcTestnetEnabled = process.env.BTCTESTNET === 'true';
      const isBitcoin = coinType === 0 || (coinType === 1 && btcTestnetEnabled);

      // MNEE create-and-hold: mnee.transfer(recipients, wif, { broadcast: false }) → return rawtx so client can broadcast later
      if (useMneeTransfer && MneeClass) {
        try {
          const sdk = new BSVSDK({
            isTestnet,
            maxAddresses: 100000,
            feeRate: network_fee
          });
          const fullPath = `${account_path.trim()}/0/0`;
          const keypair = sdk.generateKeyPairAtPath(mnemonic, fullPath, 'p2pkh');
          const wif = keypair.privateKey;
          const mnee = new MneeClass({
            environment: 'production',
            ...(process.env.MNEE_API_KEY && { apiKey: process.env.MNEE_API_KEY })
          });
          const recipients = mnee_recipients.map((r: { address: string; amount: number }) => ({ address: String(r.address).trim(), amount: Number(r.amount) }));
          const created = await mnee.transfer(recipients, wif, { broadcast: false });
          const rawtx = (created && (created.rawtx ?? (created as any).rawTx)) ? String(created.rawtx ?? (created as any).rawTx).trim() : '';
          if (!rawtx || rawtx.length < 20) {
            throw new Error('MNEE transfer did not return raw tx (create-and-hold)');
          }
          res.status(200).json({
            result: 'success',
            code: 'RW_SUCCESS',
            msg: 'transaction signed successfully',
            data: { tx_id: tx_id.trim(), tx_data: rawtx, tx_type: 'MNEE' }
          });
          return;
        } catch (mneeErr) {
          console.error('MNEE create-and-hold failed:', mneeErr instanceof Error ? mneeErr.message : mneeErr);
          throw new Error('MNEE transfer failed: ' + (mneeErr instanceof Error ? mneeErr.message : 'Unknown error'));
        }
      } else if (useMneeTransfer && !MneeClass) {
        throw new Error('MNEE create-and-hold requires @mnee/ts-sdk');
      }

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

      // Bitcoin signing is offline: require script_pub_key_hex (and for P2PKH, previous_tx_hex) per UTXO
      if (isBitcoin) {
        for (let i = 0; i < utxos.length; i++) {
          const utxo = utxos[i];
          const scriptHex = typeof utxo.script_pub_key_hex === 'string' ? utxo.script_pub_key_hex.trim() : '';
          if (!scriptHex) {
            res.status(400).json({
              result: 'error',
              code: 'VALIDATION_ERROR',
              msg: 'validation error',
              errors: [{
                code: 'INVALID_INPUT_ERROR',
                err_msg: `Each utxo must include script_pub_key_hex for Bitcoin (offline signing). For legacy P2PKH inputs, also include previous_tx_hex (utxo ${i})`
              }]
            });
            return;
          }
        }
      }

      // For UTXO_BASED BSV: optional tx_type (protocol) for non-native token support
      let resolvedTxType: string = requestedTxType != null ? String(requestedTxType).trim() : '';
      if (!isBitcoin && resolvedTxType !== '') {
        if (!isAllowedProtocol(resolvedTxType)) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_INPUT_ERROR',
              err_msg: 'tx_type must be one of: native, MNEE, 1Sat, MNEE-STAS, STAS, inscription, RUN, BCAT, paymail, covenant, custom'
            }]
          });
          return;
        }
      }
      if (!isBitcoin && resolvedTxType === '' && typeof tx_data === 'string' && tx_data.trim().length >= 20) {
        try {
          const detected = detectTxType(tx_data.trim());
          if (detected.protocol !== 'native') resolvedTxType = detected.protocol;
        } catch {
          // keep resolvedTxType as '' (native)
        }
      }

      // BSV non-native (MNEE, 1Sat, MNEE-STAS, STAS, inscription, RUN, BCAT, paymail, covenant, custom): require script_pub_key_hex per UTXO so signing uses the exact on-chain script (avoids "script validation failed" e.g. from MNEE V2). BTC path unchanged (bitcoinjs-lib).
      if (!isBitcoin && resolvedTxType !== '' && resolvedTxType !== 'native') {
        for (let i = 0; i < utxos.length; i++) {
          const scriptHex = typeof utxos[i].script_pub_key_hex === 'string' ? utxos[i].script_pub_key_hex.trim() : '';
          if (!scriptHex) {
            res.status(400).json({
              result: 'error',
              code: 'VALIDATION_ERROR',
              msg: 'validation error',
              errors: [{
                code: 'INVALID_INPUT_ERROR',
                err_msg: `For BSV non-native (${resolvedTxType}) transactions, each utxo must include script_pub_key_hex (exact scriptPubKey of the spent output). Missing for utxo ${i}.`
              }]
            });
            return;
          }
          // Only P2PKH and P2PK spendable outputs are supported for MNEE/1Sat/etc.; custom/covenant scripts are not.
          try {
            const lockingScript = LockingScript.fromHex(scriptHex);
            const scriptType = getLockingScriptType(lockingScript);
            if (scriptType === 'other') {
              res.status(400).json({
                result: 'error',
                code: 'VALIDATION_ERROR',
                msg: 'validation error',
                errors: [{
                  code: 'INVALID_INPUT_ERROR',
                  err_msg: `For BSV non-native (${resolvedTxType}), script_pub_key_hex must be the exact scriptPubKey of the output being spent (P2PKH or P2PK owner output). UTXO ${i} has a custom/OP_RETURN script; use the spendable output's script, not the protocol data output.`
                }]
              });
              return;
            }
          } catch {
            res.status(400).json({
              result: 'error',
              code: 'VALIDATION_ERROR',
              msg: 'validation error',
              errors: [{
                code: 'INVALID_INPUT_ERROR',
                err_msg: `Invalid script_pub_key_hex for utxo ${i}: must be valid hex scriptPubKey (P2PKH or P2PK).`
              }]
            });
            return;
          }
        }
      }

      // Use SDK for transaction signing - all blockchain operations in SDK
      let signedHex: string;
      if (isBitcoin) {
        // Bitcoin (BTC) - use SDK BitcoinTransactionSigner; mainnet when coin type 0, testnet when coin type 1 (BTCTESTNET=true)
        const bitcoinIsMainnet = coinType === 0;
        const bitcoinParams = {
          unsignedTxHex: tx_data.trim(),
          utxos: utxos.map(utxo => ({
            tx_hash: utxo.tx_hash.trim(),
            vout: utxo.vout,
            script_pub_key_hex: typeof utxo.script_pub_key_hex === 'string' ? utxo.script_pub_key_hex.trim() : '',
            value: utxo.value,
            previous_tx_hex: typeof (utxo as any).previous_tx_hex === 'string' ? (utxo as any).previous_tx_hex.trim() : undefined
          })),
          privateKeys,
          isMainnet: bitcoinIsMainnet
        };

        const bitcoinResult = await BitcoinTransactionSigner.signTransaction(bitcoinParams);
        signedHex = bitcoinResult.signedTransactionHex;
      } else {
        // BSV - use SDK BSVTransactionSigner (real mainnet/testnet, no mocks)
        // Protocol-aware signing for MNEE, 1Sat, STAS, RUN, etc.; optional sighash for protocols that require it
        const signOutputs = (signOutputsReq === 'none' || signOutputsReq === 'single') ? signOutputsReq : 'all';
        const anyoneCanPay = anyoneCanPayReq === true;
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
          rpcUrl: process.env.BSV_RPC_URL,
          ...(signOutputs !== 'all' && { signOutputs }),
          ...(anyoneCanPay && { anyoneCanPay })
        };

        const bsvResult = await BSVTransactionSigner.signTransaction(bsvParams);
        signedHex = bsvResult.signedTransactionHex;

        // MNEE/1Sat pre-built tx: send user-signed tx to MNEE to add cosigner; return final raw tx so client can broadcast
        if (resolvedTxType === 'MNEE' || resolvedTxType === '1Sat') {
          if (MneeClass) {
            try {
              const mnee = new MneeClass({
                environment: 'production',
                ...(process.env.MNEE_API_KEY && { apiKey: process.env.MNEE_API_KEY })
              });
              const mneeResult = await mnee.submitRawTx(signedHex, { broadcast: false });
              const finalHex = (mneeResult && (mneeResult.rawtx ?? mneeResult.rawTx)) ? String(mneeResult.rawtx ?? mneeResult.rawTx).trim() : '';
              if (finalHex && finalHex.length >= 20) {
                signedHex = finalHex;
              } else {
                throw new Error('MNEE API did not return cosigner-signed raw tx (response.rawtx missing or empty)');
              }
            } catch (mneeErr) {
              console.error('MNEE cosigner step failed:', mneeErr instanceof Error ? mneeErr.message : mneeErr);
              throw new Error('MNEE cosigner failed: ' + (mneeErr instanceof Error ? mneeErr.message : 'Unknown error'));
            }
          } else {
            throw new Error('MNEE cosigner requires @mnee/ts-sdk for MNEE/1Sat transactions');
          }
        }
      }

      const responseData: { tx_id: string; tx_data: string; tx_type?: string } = {
        tx_id: tx_id.trim(),
        tx_data: signedHex
      };
      if (!isBitcoin && resolvedTxType) responseData.tx_type = resolvedTxType;
      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'transaction signed successfully',
        data: responseData
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

