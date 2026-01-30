import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import User from '../models/User';

// Extend Express Request type (extends definition from auth.ts)

const authService = new AuthService();

/**
 * JWT Authentication Middleware
 * Validates Bearer token and attaches user to request
 */
export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        result: 'error',
        code: 'UNAUTHORIZED',
        msg: 'authentication required',
        errors: [{
          code: 'AUTH_REQUIRED_ERROR',
          err_msg: 'Bearer token required. Provide valid JWT token in Authorization header.'
        }]
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const payload = authService.verifyAccessToken(token);

    if (!payload) {
      res.status(401).json({
        result: 'error',
        code: 'UNAUTHORIZED',
        msg: 'invalid or expired token',
        errors: [{
          code: 'INVALID_TOKEN_ERROR',
          err_msg: 'JWT token is invalid or expired. Please login again.'
        }]
      });
      return;
    }

    // Verify user still exists and is active
    const user = await User.findOne({
      userId: payload.userId,
      isActive: true
    });

    if (!user) {
      res.status(401).json({
        result: 'error',
        code: 'UNAUTHORIZED',
        msg: 'user not found or inactive',
        errors: [{
          code: 'USER_INACTIVE_ERROR',
          err_msg: 'User account is inactive or deleted.'
        }]
      });
      return;
    }

    // Verify access token session is still active (check for logout)
    if (payload.jti) {
      const isActive = await authService.isAccessTokenSessionActive(payload.jti, payload.userId);
      if (!isActive) {
        res.status(401).json({
          result: 'error',
          code: 'UNAUTHORIZED',
          msg: 'session revoked',
          errors: [{
            code: 'SESSION_REVOKED_ERROR',
            err_msg: 'Your session has been logged out. Please login again.'
          }]
        });
        return;
      }
    }

    // Attach user to request
    req.user = {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      walletId: payload.walletId
    };

    next();
  } catch (error) {
    console.error('JWT authentication error:', error);
    res.status(401).json({
      result: 'error',
      code: 'UNAUTHORIZED',
      msg: 'authentication failed',
      errors: [{
        code: 'AUTH_ERROR',
        err_msg: 'Authentication processing failed.'
      }]
    });
  }
};

/**
 * Optional JWT Authentication
 * Attaches user if token is valid, but doesn't fail if missing
 */
export const optionalJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const payload = authService.verifyAccessToken(token);

      if (payload) {
        const user = await User.findOne({
          userId: payload.userId,
          isActive: true
        });

        if (user) {
          req.user = {
            userId: payload.userId,
            username: payload.username,
            email: payload.email,
            walletId: payload.walletId
          };
        }
      }
    }

    next();
  } catch (error) {
    // Ignore errors and continue
    next();
  }
};

