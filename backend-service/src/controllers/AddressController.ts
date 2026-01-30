import { Request, Response } from 'express';
import { ShardingService } from '../services/ShardingService';
import { BSVService } from '../services/BSVService';
import Wallet from '../models/Wallet';
import Account from '../models/Account';
import Address from '../models/Address';
import User from '../models/User';

export class AddressController {
  private bsvService: BSVService;

  constructor() {
    this.bsvService = new BSVService(process.env.BSV_NETWORK === 'testnet');
  }

  /**
   * Create address endpoint
   * POST /api/v1/wallets/{wallet_id}/addresses/create
   */
  createAddress = async (req: Request, res: Response): Promise<void> => {
    // This endpoint is disabled - address creation is handled automatically during account setup
    res.status(400).json({
      result: 'error',
      code: 'NOT_SUPPORTED',
      msg: 'address creation not supported',
      errors: [{
        code: 'FEATURE_NOT_SUPPORTED',
        err_msg: 'Address creation is handled automatically during account setup.'
      }]
    });
    return;
  };

  // Old implementation (disabled)
  private _createAddressOld = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { account_id, currency_id, blockchain_id } = req.body;

      // Validate required fields
      if (!account_id || !currency_id || !blockchain_id) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'account_id, currency_id, and blockchain_id fields are required'
          }]
        });
        return;
      }

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

      // Validate account exists
      const account = await Account.findOne({ 
        accountId: account_id, 
        walletId: wallet_id, 
        isActive: true 
      });
      if (!account) {
        res.status(404).json({
          result: 'error',
          code: 'ACCOUNT_NOT_FOUND',
          msg: 'account not found'
        });
        return;
      }

      // Generate new address using the account's xpub
      const addressIndex = await this.getNextAddressIndex(account_id);
      const derivedAddress = this.bsvService.deriveAddressFromXPub(
        account.xpub, 
        addressIndex, 
        0
      );

      // Generate address ID
      const addressId = `addr_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      // Create address document
      const address = new Address({
        addressId: addressId,
        walletId: wallet_id,
        accountId: account_id,
        address: derivedAddress.address,
        derivationPath: derivedAddress.derivationPath,
        addressIndex: addressIndex,
        currencyCode: currency_id
      });

      await address.save();

      res.status(201).json({
        result: 'success',
        code: 'RW_CREATED',
        msg: 'address generated',
        data: {
          address_id: addressId,
          address: derivedAddress.address,
          derivation_path: derivedAddress.derivationPath,
          address_index: addressIndex,
          account_id: account_id,
          currency_code: currency_id,
          explorer_url: this.bsvService.getAddressExplorerUrl(derivedAddress.address)
        }
      });

    } catch (error) {
      console.error('Error creating address:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'ADDRESS_CREATION_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Get addresses endpoint
   * GET /api/v1/wallets/{wallet_id}/addresses
   */
  getAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { account_id, currency_code, limit = 50, offset = 0 } = req.query;

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

      // Build query
      const query: any = { walletId: wallet_id, isActive: true };
      
      if (account_id) {
        query.accountId = account_id;
      }
      
      if (currency_code) {
        query.currencyCode = currency_code;
      }

      // Get addresses with pagination
      const addresses = await Address.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit as string))
        .skip(parseInt(offset as string));

      // Get total count
      const totalCount = await Address.countDocuments(query);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          addresses: addresses.map(address => ({
            address_id: address.addressId,
            address: address.address,
            derivation_path: address.derivationPath,
            address_index: address.addressIndex,
            account_id: address.accountId,
            currency_code: address.currencyCode,
            created_at: address.createdAt,
            explorer_url: this.bsvService.getAddressExplorerUrl(address.address)
          })),
          pagination: {
            total: totalCount,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            has_more: (parseInt(offset as string) + addresses.length) < totalCount
          }
        }
      });

    } catch (error) {
      console.error('Error getting addresses:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Get address info endpoint
   * GET /api/v1/wallets/{wallet_id}/addresses/{address_id}
   */
  getAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id, address_id } = req.params;

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

      // Get address
      const address = await Address.findOne({ 
        addressId: address_id, 
        walletId: wallet_id, 
        isActive: true 
      });
      
      if (!address) {
        res.status(404).json({
          result: 'error',
          code: 'ADDRESS_NOT_FOUND',
          msg: 'address not found'
        });
        return;
      }

      // Get balance for this address
      let balance = null;
      try {
        balance = await this.bsvService.getBalance(address.address);
      } catch (error) {
        console.error(`Error getting balance for address ${address.address}:`, error);
        // Continue without balance information
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          address_id: address.addressId,
          address: address.address,
          derivation_path: address.derivationPath,
          address_index: address.addressIndex,
          account_id: address.accountId,
          currency_code: address.currencyCode,
          created_at: address.createdAt,
          explorer_url: this.bsvService.getAddressExplorerUrl(address.address),
          balance: balance ? {
            native: {
              confirmed: balance.native.confirmed,
              unconfirmed: balance.native.unconfirmed,
              total: balance.native.total,
              bsv: balance.native.bsv,
              utxos: balance.native.utxos
            },
            tokens: balance.tokens
          } : null
        }
      });

    } catch (error) {
      console.error('Error getting address:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Generate multiple addresses endpoint
   * POST /api/v1/wallets/{wallet_id}/addresses/generate-batch
   */
  generateBatchAddresses = async (req: Request, res: Response): Promise<void> => {
    // This endpoint is disabled - addresses are generated automatically
    res.status(400).json({
      result: 'error',
      code: 'NOT_SUPPORTED',
      msg: 'batch address generation not supported',
      errors: [{
        code: 'FEATURE_NOT_SUPPORTED',
        err_msg: 'Batch address generation is not supported. Addresses are created automatically with accounts.'
      }]
    });
    return;
  };

  // Old implementation (disabled)
  private _generateBatchAddressesOld = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { account_id, currency_id, blockchain_id, count = 10 } = req.body;

      // Validate required fields
      if (!account_id || !currency_id || !blockchain_id) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'account_id, currency_id, and blockchain_id fields are required'
          }]
        });
        return;
      }

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

      // Validate account exists
      const account = await Account.findOne({ 
        accountId: account_id, 
        walletId: wallet_id, 
        isActive: true 
      });
      if (!account) {
        res.status(404).json({
          result: 'error',
          code: 'ACCOUNT_NOT_FOUND',
          msg: 'account not found'
        });
        return;
      }

      // Generate multiple addresses
      const addresses = [];
      const startIndex = await this.getNextAddressIndex(account_id);
      
      for (let i = 0; i < count; i++) {
        const addressIndex = startIndex + i;
        const derivedAddress = this.bsvService.deriveAddressFromXPub(
          account.xpub, 
          addressIndex, 
          0
        );

        const addressId = `addr_${Date.now()}_${i}_${Math.random().toString(36).substring(2)}`;

        const address = new Address({
          addressId: addressId,
          walletId: wallet_id,
          accountId: account_id,
          address: derivedAddress.address,
          derivationPath: derivedAddress.derivationPath,
          addressIndex: addressIndex,
          currencyCode: currency_id
        });

        await address.save();
        addresses.push({
          address_id: addressId,
          address: derivedAddress.address,
          derivation_path: derivedAddress.derivationPath,
          address_index: addressIndex,
          explorer_url: this.bsvService.getAddressExplorerUrl(derivedAddress.address)
        });
      }

      res.status(201).json({
        result: 'success',
        code: 'RW_CREATED',
        msg: 'addresses generated',
        data: {
          addresses: addresses,
          count: addresses.length,
          account_id: account_id,
          currency_code: currency_id
        }
      });

    } catch (error) {
      console.error('Error generating batch addresses:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Helper method to get next address index for an account
   */
  private async getNextAddressIndex(accountId: string): Promise<number> {
    const lastAddress = await Address.findOne({ accountId })
      .sort({ addressIndex: -1 })
      .limit(1);
    
    return lastAddress ? lastAddress.addressIndex + 1 : 0;
  }

  /**
   * Get addresses (User-based)
   * POST /api/v1/users/addresses
   * Returns all addresses for authenticated user's accounts
   */
  getAddressesForUser = async (req: Request, res: Response): Promise<void> => {
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

      // Get all addresses from user's accounts
      const addresses = [];
      for (const account of user.accounts) {
        addresses.push({
          address: account.address.address,
          address_index: account.address.addressIndex,
          derivation_path: account.address.derivationPath,
          public_key: account.address.publicKey,
          account_id: account.accountId,
          account_type: account.accountType,
          account_index: account.accountIndex,
          is_used: false, // Could be determined from transaction history
          created_at: account.createdAt
        });
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          user_id: user.userId,
          wallet_id: user.walletId,
          addresses: addresses,
          total_count: addresses.length
        }
      });

    } catch (error) {
      console.error('Error getting addresses:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };
}
