import { Request, Response } from 'express';
import { BSVService } from '../services/BSVService';
import Wallet from '../models/Wallet';
import Address from '../models/Address';
import User from '../models/User';

export class BalanceController {
  private bsvService: BSVService;

  constructor() {
    this.bsvService = new BSVService(process.env.BSV_NETWORK === 'testnet');
  }

  /**
   * Sync balance endpoint
   * POST /api/v1/wallets/{wallet_id}/balance/sync
   */
  syncBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { account_ids } = req.body;

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

      // Get addresses for the specified accounts
      const addresses = await Address.find({ 
        walletId: wallet_id, 
        isActive: true 
      });

      if (addresses.length === 0) {
        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'balance sync successful',
          data: {
            wallet_id: wallet_id,
            accounts: []
          }
        });
        return;
      }

      // Get balances for all addresses
      const accountBalances = [];
      for (const address of addresses) {
        try {
          const balance = await this.bsvService.getBalance(address.address);
          
          accountBalances.push({
            account_id: address.accountId,
            portfolio_id: 'default', // You can extend this to get actual portfolio ID
            paymail_id: null, // Optional
            currency_id: 'bsv',
            blockchain_id: 'bitcoin-sv',
            current_balance: balance.native.total,
            pending_received_balance: balance.native.unconfirmed,
            pending_sent_balance: 0, // You can calculate this from pending transactions
            pending_txns: 0 // You can calculate this from pending transactions
          });
        } catch (error) {
          console.error(`Error getting balance for address ${address.address}:`, error);
          // Continue with other addresses even if one fails
        }
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'balance sync successful',
        data: {
          wallet_id: wallet_id,
          accounts: accountBalances
        }
      });

    } catch (error) {
      console.error('Error syncing balance:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Get balance endpoint
   * GET /api/v1/wallets/{wallet_id}/balance
   */
  getBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet_id } = req.params;
      const { address } = req.query;

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

      let targetAddress: string;
      
      if (address) {
        // Get balance for specific address
        targetAddress = address as string;
        
        // Validate address format
        if (!this.bsvService.validateAddress(targetAddress)) {
          res.status(400).json({
            result: 'error',
            code: 'VALIDATION_ERROR',
            msg: 'validation error',
            errors: [{
              code: 'INVALID_ADDRESS_ERROR',
              err_msg: 'invalid address format'
            }]
          });
          return;
        }
      } else {
        // Validate wallet type - legacy APIs cannot use MPC wallets
        if (wallet.walletType === 'mpc') {
          res.status(400).json({
            result: 'error',
            code: 'INVALID_WALLET_TYPE',
            msg: 'MPC wallets cannot use legacy balance API. Use MPC APIs instead.',
            errors: [{
              code: 'INVALID_WALLET_TYPE_ERROR',
              err_msg: 'This wallet is an MPC wallet. Use MPC APIs for balance queries.'
            }]
          });
          return;
        }

        // Get balance for wallet's primary address (derived from xpub)
        // Derive first address from wallet's xpub
        const derivedAddress = this.bsvService.deriveAddressFromXPub(wallet.xpub, 0, 0);
        targetAddress = derivedAddress.address;
      }

      // Get balance information
      const balance = await this.bsvService.getBalance(targetAddress);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          wallet_id: wallet_id,
          address: targetAddress,
          balance: {
            native: {
              confirmed: balance.native.confirmed,
              unconfirmed: balance.native.unconfirmed,
              total: balance.native.total,
              bsv: balance.native.bsv,
              utxos: balance.native.utxos
            },
            tokens: balance.tokens
          },
          explorer_url: this.bsvService.getAddressExplorerUrl(targetAddress)
        }
      });

    } catch (error) {
      console.error('Error getting balance:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Get balance summary endpoint
   * GET /api/v1/wallets/{wallet_id}/balance/summary
   */
  getBalanceSummary = async (req: Request, res: Response): Promise<void> => {
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

      // Get all addresses for this wallet
      const addresses = await Address.find({ 
        walletId: wallet_id, 
        isActive: true 
      });

      if (addresses.length === 0) {
        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'success',
          data: {
            wallet_id: wallet_id,
            total_balance: {
              native: {
                confirmed: 0,
                unconfirmed: 0,
                total: 0,
                bsv: '0.00000000'
              },
              tokens: []
            },
            addresses_count: 0
          }
        });
        return;
      }

      // Aggregate balances from all addresses
      let totalConfirmed = 0;
      let totalUnconfirmed = 0;
      const allTokens: { [key: string]: any } = {};

      for (const address of addresses) {
        try {
          const balance = await this.bsvService.getBalance(address.address);
          
          totalConfirmed += balance.native.confirmed;
          totalUnconfirmed += balance.native.unconfirmed;

          // Aggregate token balances
          for (const token of balance.tokens) {
            if (allTokens[token.tokenId]) {
              allTokens[token.tokenId].balance += token.balance;
            } else {
              allTokens[token.tokenId] = { ...token };
            }
          }
        } catch (error) {
          console.error(`Error getting balance for address ${address.address}:`, error);
          // Continue with other addresses
        }
      }

      const totalBalance = totalConfirmed + totalUnconfirmed;
      const totalBSV = this.bsvService.satoshisToBSV(totalBalance);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          wallet_id: wallet_id,
          total_balance: {
            native: {
              confirmed: totalConfirmed,
              unconfirmed: totalUnconfirmed,
              total: totalBalance,
              bsv: totalBSV
            },
            tokens: Object.values(allTokens)
          },
          addresses_count: addresses.length,
          synced_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting balance summary:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error'
      });
    }
  };

  /**
   * Get balance endpoint (User-based)
   * POST /api/v1/users/balance
   * Returns all account balances for a user (JWT required)
   */
  getBalanceForUser = async (req: Request, res: Response): Promise<void> => {
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
          msg: 'user not found',
          errors: [{
            code: 'USER_NOT_FOUND_ERROR',
            err_msg: 'user not found'
          }]
        });
        return;
      }

      // Get balances for all accounts
      // Use user's network to create correct BSVService instance
      const isTestnet = user.network !== 'mainnet';
      const bsvService = new BSVService(isTestnet);
      
      const accountBalances = [];
      for (const account of user.accounts) {
        try {
          const address = account.address.address;
          const balance = await bsvService.getBalance(address);
          
          accountBalances.push({
            account_id: account.accountId,
            account_type: account.accountType,
            account_index: account.accountIndex,
            address: address,
            public_key: account.address.publicKey,
            derivation_path: account.address.derivationPath,
            balance: {
              native: {
                confirmed: balance.native.confirmed,
                confirmed_bsv: (balance.native.confirmed / 100000000).toFixed(8),
                utxos: balance.native.utxos
              },
              tokens: balance.tokens
            },
            explorer_url: bsvService.getAddressExplorerUrl(address)
          });
        } catch (error) {
          console.error(`Error getting balance for account ${account.accountId}:`, error);
          // Continue with other accounts even if one fails
        }
      }

      // Calculate total confirmed balance only
      const totalBalance = accountBalances.reduce((sum, acc) => sum + acc.balance.native.confirmed, 0);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'success',
        data: {
          user_id: user.userId,
          wallet_id: user.walletId,
          network: user.network,
          total_balance: totalBalance,
          total_balance_bsv: (totalBalance / 100000000).toFixed(8),
          accounts: accountBalances,
          note: 'Only confirmed balances are included'
        }
      });

    } catch (error) {
      console.error('Error getting balance:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'BALANCE_FETCH_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };
}
