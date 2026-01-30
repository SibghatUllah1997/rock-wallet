import User from '../models/User';
import Session from '../models/Session';
import { AuthService } from './AuthService';

/**
 * User Management Service
 * Provides production-ready user management features
 */
export class UserManagementService {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Deactivate user account (soft delete)
   */
  async deactivateUser(userId: string): Promise<boolean> {
    try {
      const user = await User.findOne({ userId, isActive: true });
      if (!user) {
        return false;
      }

      // Deactivate user
      user.isActive = false;
      await user.save();

      // Revoke all active sessions
      await this.authService.revokeAllUserSessions(userId);

      return true;
    } catch (error) {
      console.error('Error deactivating user:', error);
      return false;
    }
  }

  /**
   * Reactivate user account
   */
  async reactivateUser(userId: string): Promise<boolean> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        return false;
      }

      user.isActive = true;
      await user.save();

      return true;
    } catch (error) {
      console.error('Error reactivating user:', error);
      return false;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    accountCount: number;
    network: string;
    createdAt: Date;
    lastLogin?: Date;
  } | null> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        return null;
      }

      const allSessions = await Session.find({ userId });
      const activeSessions = await Session.find({
        userId,
        isActive: true,
        expiresAt: { $gte: new Date() }
      });

      // Get most recent session creation as last login
      const lastSession = await Session.findOne({ userId })
        .sort({ createdAt: -1 })
        .limit(1);

      return {
        totalSessions: allSessions.length,
        activeSessions: activeSessions.length,
        accountCount: user.accounts.length,
        network: user.network,
        createdAt: user.createdAt,
        lastLogin: lastSession?.createdAt
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return null;
    }
  }

  /**
   * Verify user email (placeholder for email verification)
   */
  async verifyEmail(userId: string): Promise<boolean> {
    // Placeholder for email verification implementation
    // In production, this would:
    // 1. Generate verification token
    // 2. Send verification email
    // 3. Mark email as verified when token is confirmed
    return true;
  }

  /**
   * Update user metadata
   */
  async updateUserMetadata(
    userId: string,
    metadata: {
      deviceId?: string;
      clientId?: string;
      ipAddress?: string;
    }
  ): Promise<boolean> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        return false;
      }

      user.metadata = {
        ...user.metadata,
        ...metadata
      };

      await user.save();
      return true;
    } catch (error) {
      console.error('Error updating user metadata:', error);
      return false;
    }
  }

  /**
   * Check if user exists by username or email
   */
  async userExists(identifier: string): Promise<boolean> {
    try {
      const user = await User.findOne({
        $or: [
          { username: identifier.toLowerCase() },
          { email: identifier.toLowerCase() }
        ]
      });

      return !!user;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  }

  /**
   * Get user by identifier (username or email)
   */
  async getUserByIdentifier(identifier: string): Promise<{
    userId: string;
    username: string;
    email: string;
    walletId: string;
    network: string;
    isActive: boolean;
    createdAt: Date;
  } | null> {
    try {
      const user = await User.findOne({
        $or: [
          { username: identifier.toLowerCase() },
          { email: identifier.toLowerCase() }
        ]
      }).select('-password -shard1 -shard2'); // Exclude sensitive data

      if (!user) {
        return null;
      }

      return {
        userId: user.userId,
        username: user.username,
        email: user.email,
        walletId: user.walletId,
        network: user.network,
        isActive: user.isActive,
        createdAt: user.createdAt
      };
    } catch (error) {
      console.error('Error getting user by identifier:', error);
      return null;
    }
  }
}

/**
 * Factory function for testing
 */
export function createUserManagementService(): UserManagementService {
  return new UserManagementService();
}

