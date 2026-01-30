import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import Session from '../models/Session';

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  walletId: string;
  jti?: string; // JWT ID for token tracking
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export class AuthService {
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private refreshTokenExpiresIn: number; // days

  constructor() {
    // JWT_SECRET is required - fail if not set
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required. Please set it in your .env file.');
    }
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.refreshTokenExpiresIn = 30; // 30 days
  }

  /**
   * Generate access token (JWT)
   */
  generateAccessToken(payload: TokenPayload, jti?: string): string {
    const secret: jwt.Secret = this.jwtSecret;
    const tokenPayload = jti ? { ...payload, jti } : payload;
    return jwt.sign(tokenPayload as object, secret, {
      expiresIn: this.jwtExpiresIn,
      issuer: 'bsv-wallet-service',
      audience: 'bsv-wallet-client'
    } as jwt.SignOptions);
  }

  /**
   * Generate refresh token (random string)
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate JWT ID for access token tracking
   */
  generateAccessTokenId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'bsv-wallet-service',
        audience: 'bsv-wallet-client'
      }) as TokenPayload;
      return decoded;
    } catch (error) {
      // Log only in development
      if (process.env.NODE_ENV === 'development') {
        if (error instanceof jwt.JsonWebTokenError) {
          console.error('JWT verification error:', error.message);
        } else if (error instanceof jwt.TokenExpiredError) {
          console.error('JWT expired:', error.expiredAt);
        }
      }
      return null;
    }
  }

  /**
   * Check if access token session is still active
   */
  async isAccessTokenSessionActive(jti: string, userId: string): Promise<boolean> {
    if (!jti) {
      return false; // No jti means old token format, reject it
    }
    
    try {
      const now = new Date();
      const session = await Session.findOne({
        accessTokenId: jti,
        userId,
        isActive: true,
        expiresAt: { $gte: now }
      }).lean(); // Use lean() for better performance
      
      return !!session;
    } catch (error) {
      console.error('[AuthService] Error checking session:', error);
      return false;
    }
  }

  /**
   * Create session and generate tokens
   */
  async createSession(
    userId: string,
    deviceId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthTokens> {
    // Get user for token payload
    const user = await User.findOne({ userId, isActive: true });
    if (!user) {
      throw new Error('User not found or inactive');
    }

    // Generate tokens
    const accessTokenId = this.generateAccessTokenId();
    const payload: TokenPayload = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      walletId: user.walletId
    };

    const accessToken = this.generateAccessToken(payload, accessTokenId);
    const refreshToken = this.generateRefreshToken();

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpiresIn);

    // Create session with access token ID
    const sessionId = crypto.randomUUID();
    const session = new Session({
      sessionId,
      userId,
      accessTokenId,
      refreshToken,
      deviceId,
      ipAddress,
      userAgent,
      expiresAt,
      isActive: true
    });

    await session.save();

    // Parse expiresIn to seconds
    const expiresInSeconds = this.parseExpiresIn(this.jwtExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInSeconds,
      tokenType: 'Bearer'
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    // Find active session
    const session = await Session.findOne({
      refreshToken,
      isActive: true,
      expiresAt: { $gte: new Date() }
    });

    if (!session) {
      return null;
    }

    // Get user
    const user = await User.findOne({ userId: session.userId, isActive: true });
    if (!user) {
      // Invalidate session if user is inactive
      session.isActive = false;
      await session.save();
      return null;
    }

    // Generate new access token with new ID
    const accessTokenId = this.generateAccessTokenId();
    const payload: TokenPayload = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      walletId: user.walletId
    };

    const accessToken = this.generateAccessToken(payload, accessTokenId);
    const expiresInSeconds = this.parseExpiresIn(this.jwtExpiresIn);

    // Update session with new access token ID
    session.accessTokenId = accessTokenId;
    await session.save();

    return {
      accessToken,
      refreshToken: session.refreshToken, // Reuse same refresh token
      expiresIn: expiresInSeconds,
      tokenType: 'Bearer'
    };
  }

  /**
   * Revoke session (logout)
   */
  async revokeSession(refreshToken: string): Promise<boolean> {
    const session = await Session.findOne({ refreshToken, isActive: true });
    if (session) {
      session.isActive = false;
      await session.save();
      return true;
    }
    return false;
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await Session.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );
    return result.modifiedCount;
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<ISession[]> {
    return Session.find({
      userId,
      isActive: true,
      expiresAt: { $gte: new Date() }
    }).sort({ createdAt: -1 });
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await Session.updateMany(
      { expiresAt: { $lt: new Date() }, isActive: true },
      { isActive: false }
    );
    return result.modifiedCount;
  }

  /**
   * Parse expiresIn string to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1), 10);

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 86400; // Default 1 day
    }
  }
}

// Export type for Session
import type { ISession } from '../models/Session';
export type { ISession };

