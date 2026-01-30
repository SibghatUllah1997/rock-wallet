import { Request, Response } from 'express';
import * as crypto from 'crypto';
import User from '../models/User';
import { ShardingService } from '../services/ShardingService';
import { BSVService } from '../services/BSVService';
import { BSVSDK } from '../../../bsv-sdk/dist/index';
import { AuthService } from '../services/AuthService';
import { EncryptionService, createEncryptionService } from '../services/EncryptionService';
import { UserManagementService, createUserManagementService } from '../services/UserManagementService';

export class UserController {
  private bsvService: BSVService;
  private authService: AuthService;
  private encryptionService: EncryptionService;
  private userManagementService: UserManagementService;

  constructor(encryptionKey?: string) {
    this.bsvService = new BSVService(process.env.BSV_NETWORK !== 'mainnet');
    this.authService = new AuthService();
    this.userManagementService = createUserManagementService();
    // Allow injection of encryption key for testing
    try {
      this.encryptionService = createEncryptionService(encryptionKey);
    } catch (error) {
      // If encryption service fails to initialize, log but don't fail
      // This allows the service to start even if encryption key is missing (will fail on actual use)
      console.warn('EncryptionService initialization warning:', error instanceof Error ? error.message : 'Unknown error');
      // Create a dummy instance for type compatibility (will throw on actual use)
      this.encryptionService = createEncryptionService('dummy-key-for-initialization');
    }
  }

  /**
   * Create user endpoint
   * POST /api/v1/users/create
   * Creates user with username, email, password
   * Generates random mnemonic, creates wallet data, creates 2 accounts with addresses
   * All embedded in User document - no separate Wallet/Account/Address documents
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, email, password, name } = req.body;

      // Validate required fields
      if (!username || !email || !password) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'username, email, and password are required'
          }]
        });
        return;
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
      });

      if (existingUser) {
        res.status(400).json({
          result: 'error',
          code: 'USER_EXISTS',
          msg: 'user already exists',
          errors: [{
            code: 'USER_EXISTS_ERROR',
            err_msg: 'Username or email already registered'
          }]
        });
        return;
      }

      // Generate wallet with shards (random mnemonic)
      const walletData = ShardingService.generateWalletWithShards();
      const walletId = walletData.walletId;
      const network = process.env.BSV_NETWORK || 'testnet';
      const isTestnet = network === 'testnet';

      // Encrypt shards before storing/sending
      const encryptedShard1 = this.encryptionService.encryptShard(walletData.shard1);
      const encryptedShard2 = this.encryptionService.encryptShard(walletData.shard2);
      const encryptedShard3 = this.encryptionService.encryptShard(walletData.shard3);

      // Generate xpubs and addresses for both accounts
      const sdk = new BSVSDK({ isTestnet, maxAddresses: 100000, feeRate: 5 });
      
      // Account 0: Saving
      const savingXpubData = sdk.generateXPub(walletData.mnemonic, 0);
      const savingAddressData = sdk.deriveAddressFromXPub(savingXpubData.xpub, 0, 0, 'p2pkh');
      
      // Account 1: Current
      const currentXpubData = sdk.generateXPub(walletData.mnemonic, 1);
      const currentAddressData = sdk.deriveAddressFromXPub(currentXpubData.xpub, 0, 0, 'p2pkh');

      // Create user document with everything embedded
      const userId = crypto.randomUUID();
      const user = new User({
        userId,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password, // Will be hashed by pre-save hook
        walletId,
        xpub: walletData.xpub,
        network: network as 'testnet' | 'mainnet',
        shard1: encryptedShard1, // Store encrypted
        shard2: encryptedShard2, // Store encrypted
        accounts: [
          {
            accountId: crypto.randomUUID(),
            accountType: 'saving',
            accountIndex: 0,
            xpub: savingXpubData.xpub,
            derivationPath: `m/44'/1'/0'`,
            address: {
              address: savingAddressData.address,
              publicKey: savingAddressData.publicKey,
              derivationPath: savingAddressData.derivationPath,
              addressIndex: 0
            },
            createdAt: new Date()
          },
          {
            accountId: crypto.randomUUID(),
            accountType: 'current',
            accountIndex: 1,
            xpub: currentXpubData.xpub,
            derivationPath: `m/44'/1'/1'`,
            address: {
              address: currentAddressData.address,
              publicKey: currentAddressData.publicKey,
              derivationPath: currentAddressData.derivationPath,
              addressIndex: 0
            },
            createdAt: new Date()
          }
        ],
        metadata: {
          deviceId: req.headers['x-device-id'] as string,
          clientId: req.headers['x-client-id'] as string,
          ipAddress: req.ip
        }
      });

      await user.save();

      // Return response with encrypted shard3, wallet info, and accounts
      res.status(201).json({
        result: 'success',
        code: 'RW_CREATED',
        msg: 'user created successfully',
        data: {
          user_id: userId,
          wallet_id: walletId,
          shard3: encryptedShard3, // Return encrypted shard3
          xpub: walletData.xpub,
          network: network,
          accounts: user.accounts.map(acc => ({
            account_id: acc.accountId,
            account_type: acc.accountType,
            account_index: acc.accountIndex,
            address: acc.address.address,
            public_key: acc.address.publicKey,
            derivation_path: acc.address.derivationPath
          }))
        }
      });

    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'USER_CREATION_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Recover wallet endpoint
   * POST /api/v1/wallets/recovery
   * Uses username/password to authenticate user, recovers mnemonic from 2 DB shards,
   * re-shards using SDK, then updates 2 shards in DB and returns new shard3
   */
  recoverWallet = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;

      // Validate input
      if (!username || !password) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'username and password are required'
          }]
        });
        return;
      }

      // Find user by username or email (same as login)
      const user = await User.findOne({
        $or: [
          { username: username.toLowerCase() },
          { email: username.toLowerCase() }
        ],
        isActive: true
      }).select('+password');

      if (!user) {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_CREDENTIALS',
          msg: 'invalid credentials',
          errors: [{
            code: 'INVALID_CREDENTIALS_ERROR',
            err_msg: 'Username or password is incorrect'
          }]
        });
        return;
      }

      // Verify password (same as login)
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_CREDENTIALS',
          msg: 'invalid credentials',
          errors: [{
            code: 'INVALID_CREDENTIALS_ERROR',
            err_msg: 'Username or password is incorrect'
          }]
        });
        return;
      }

      // Authentication verified - proceed with recovery
      // Decrypt shards from database
      const decryptedShard1 = this.encryptionService.decryptShard(user.shard1);
      const decryptedShard2 = this.encryptionService.decryptShard(user.shard2);

      // Recover mnemonic using 2 decrypted shards from DB (user lost shard3)
      const recoveredMnemonic = ShardingService.recoverMnemonicFromShards(
        decryptedShard1, // Decrypted from database
        decryptedShard2  // Decrypted from database
      );

      // Re-shard the mnemonic (generate new shards)
      const newShards = ShardingService.createNewShards(recoveredMnemonic);

      // Encrypt new shards before storing/sending
      const encryptedNewShard1 = this.encryptionService.encryptShard(newShards.shards[0]);
      const encryptedNewShard2 = this.encryptionService.encryptShard(newShards.shards[1]);
      const encryptedNewShard3 = this.encryptionService.encryptShard(newShards.shards[2]);

      // Update user with encrypted new shards
      user.shard1 = encryptedNewShard1;
      user.shard2 = encryptedNewShard2;
      await user.save();

      // Return encrypted new shard3 for client
      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'wallet recovered successfully',
        data: {
          user_id: user.userId,
          wallet_id: user.walletId,
          shard3: encryptedNewShard3, // Return encrypted
          xpub: user.xpub,
          network: user.network
        }
      });

    } catch (error) {
      console.error('Error recovering wallet:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'WALLET_RECOVERY_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Login endpoint
   * POST /api/v1/auth/login
   * Authenticates user and returns JWT tokens
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'username and password are required'
          }]
        });
        return;
      }

      // Find user by username or email
      const user = await User.findOne({
        $or: [
          { username: username.toLowerCase() },
          { email: username.toLowerCase() }
        ],
        isActive: true
      }).select('+password');

      if (!user) {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_CREDENTIALS',
          msg: 'invalid credentials',
          errors: [{
            code: 'INVALID_CREDENTIALS_ERROR',
            err_msg: 'Username or password is incorrect'
          }]
        });
        return;
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_CREDENTIALS',
          msg: 'invalid credentials',
          errors: [{
            code: 'INVALID_CREDENTIALS_ERROR',
            err_msg: 'Username or password is incorrect'
          }]
        });
        return;
      }

      // Create session and generate tokens
      const deviceId = req.headers['x-device-id'] as string;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const tokens = await this.authService.createSession(
        user.userId,
        deviceId,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'login successful',
        data: {
          user_id: user.userId,
          username: user.username,
          email: user.email,
          wallet_id: user.walletId,
          network: user.network,
          ...tokens
        }
      });

    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'LOGIN_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Logout endpoint
   * POST /api/v1/auth/logout
   * Revokes refresh token session
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'refreshToken is required'
          }]
        });
        return;
      }

      const revoked = await this.authService.revokeSession(refreshToken);

      if (revoked) {
        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'logout successful',
          data: {
            logged_out: true
          }
        });
      } else {
        res.status(404).json({
          result: 'error',
          code: 'SESSION_NOT_FOUND',
          msg: 'session not found or already revoked',
          errors: [{
            code: 'SESSION_NOT_FOUND_ERROR',
            err_msg: 'Session not found or already logged out'
          }]
        });
      }

    } catch (error) {
      console.error('Error during logout:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'LOGOUT_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Refresh token endpoint
   * POST /api/v1/auth/refresh
   * Refreshes access token using refresh token
   */
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'refreshToken is required'
          }]
        });
        return;
      }

      const tokens = await this.authService.refreshAccessToken(refreshToken);

      if (tokens) {
        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'token refreshed successfully',
          data: tokens
        });
      } else {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_REFRESH_TOKEN',
          msg: 'invalid or expired refresh token',
          errors: [{
            code: 'INVALID_REFRESH_TOKEN_ERROR',
            err_msg: 'Refresh token is invalid or expired. Please login again.'
          }]
        });
      }

    } catch (error) {
      console.error('Error refreshing token:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'REFRESH_TOKEN_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Get user profile
   * GET /api/v1/users/profile
   * Returns current user's profile (requires JWT)
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

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

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'profile retrieved successfully',
        data: {
          user_id: user.userId,
          username: user.username,
          email: user.email,
          wallet_id: user.walletId,
          network: user.network,
          accounts: user.accounts.map(acc => ({
            account_id: acc.accountId,
            account_type: acc.accountType,
            account_index: acc.accountIndex,
            address: acc.address.address,
            public_key: acc.address.publicKey,
            derivation_path: acc.address.derivationPath
          })),
          created_at: user.createdAt,
          updated_at: user.updatedAt
        }
      });

    } catch (error) {
      console.error('Error getting profile:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'PROFILE_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Update user profile
   * PUT /api/v1/users/profile
   * Updates user profile (requires JWT)
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const { email } = req.body;
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

      // Update email if provided
      if (email && email !== user.email) {
        // Check if email already exists
        const existingUser = await User.findOne({
          email: email.toLowerCase(),
          userId: { $ne: user.userId }
        });

        if (existingUser) {
          res.status(400).json({
            result: 'error',
            code: 'EMAIL_EXISTS',
            msg: 'email already registered',
            errors: [{
              code: 'EMAIL_EXISTS_ERROR',
              err_msg: 'Email is already registered to another account'
            }]
          });
          return;
        }

        user.email = email.toLowerCase();
      }

      await user.save();

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'profile updated successfully',
        data: {
          user_id: user.userId,
          username: user.username,
          email: user.email,
          updated_at: user.updatedAt
        }
      });

    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'PROFILE_UPDATE_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Change password
   * POST /api/v1/users/change-password
   * Changes user password (requires JWT and current password)
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'currentPassword and newPassword are required'
          }]
        });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'PASSWORD_TOO_SHORT_ERROR',
            err_msg: 'Password must be at least 8 characters long'
          }]
        });
        return;
      }

      const user = await User.findOne({
        userId: req.user.userId,
        isActive: true
      }).select('+password');

      if (!user) {
        res.status(404).json({
          result: 'error',
          code: 'USER_NOT_FOUND',
          msg: 'user not found'
        });
        return;
      }

      // Verify current password
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_CREDENTIALS',
          msg: 'invalid current password',
          errors: [{
            code: 'INVALID_CURRENT_PASSWORD_ERROR',
            err_msg: 'Current password is incorrect'
          }]
        });
        return;
      }

      // Update password (will be hashed by pre-save hook)
      user.password = newPassword;
      await user.save();

      // Revoke all sessions to force re-login
      await this.authService.revokeAllUserSessions(user.userId);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'password changed successfully. Please login again.',
        data: {
          password_changed: true,
          sessions_revoked: true
        }
      });

    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'PASSWORD_CHANGE_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Get active sessions
   * GET /api/v1/users/sessions
   * Returns all active sessions for the user (requires JWT)
   */
  getSessions = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const sessions = await this.authService.getUserSessions(req.user.userId);

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'sessions retrieved successfully',
        data: {
          sessions: sessions.map(session => ({
            session_id: session.sessionId,
            device_id: session.deviceId,
            ip_address: session.ipAddress,
            user_agent: session.userAgent,
            created_at: session.createdAt,
            expires_at: session.expiresAt
          }))
        }
      });

    } catch (error) {
      console.error('Error getting sessions:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'SESSIONS_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Get user statistics
   * GET /api/v1/users/stats
   * Returns user statistics (requires JWT)
   */
  getUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const stats = await this.userManagementService.getUserStats(req.user.userId);

      if (!stats) {
        res.status(404).json({
          result: 'error',
          code: 'USER_NOT_FOUND',
          msg: 'user not found'
        });
        return;
      }

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'user statistics retrieved successfully',
        data: stats
      });

    } catch (error) {
      console.error('Error getting user stats:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'STATS_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Deactivate user account
   * POST /api/v1/users/deactivate
   * Deactivates user account and revokes all sessions (requires JWT)
   */
  deactivateAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'authentication required'
        });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'REQUIRED_FIELD_MISSING_ERROR',
            err_msg: 'password is required to deactivate account'
          }]
        });
        return;
      }

      // Verify password
      const user = await User.findOne({ userId: req.user.userId, isActive: true }).select('+password');
      if (!user) {
        res.status(404).json({
          result: 'error',
          code: 'USER_NOT_FOUND',
          msg: 'user not found'
        });
        return;
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        res.status(401).json({
          result: 'error',
          code: 'INVALID_CREDENTIALS',
          msg: 'invalid password',
          errors: [{
            code: 'INVALID_PASSWORD_ERROR',
            err_msg: 'Password is incorrect'
          }]
        });
        return;
      }

      // Deactivate account
      const deactivated = await this.userManagementService.deactivateUser(req.user.userId);

      if (deactivated) {
        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'account deactivated successfully',
          data: {
            deactivated: true,
            user_id: req.user.userId
          }
        });
      } else {
        res.status(500).json({
          result: 'error',
          code: 'DEACTIVATION_ERROR',
          msg: 'failed to deactivate account'
        });
      }

    } catch (error) {
      console.error('Error deactivating account:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'DEACTIVATION_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };
}

// Export factory functions for testing
export function createUserController(encryptionKey?: string): UserController {
  return new UserController(encryptionKey);
}

// Export services for testing
export { EncryptionService, createEncryptionService } from '../services/EncryptionService';
export { UserManagementService, createUserManagementService } from '../services/UserManagementService';
export { AuthService } from '../services/AuthService';
