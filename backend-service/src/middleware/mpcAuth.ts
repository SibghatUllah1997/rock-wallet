import { Request, Response, NextFunction } from 'express';
import { jwtAuthMiddleware } from './jwtVerification';

export const authenticateMpcBearer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      result: 'error',
      code: 'UNAUTHORIZED_ACCESS_ERROR',
      msg: 'unauthorized access error',
      errors: [{
        code: 'INVALID_TOKEN_ERROR',
        err_msg: 'access token is invalid or expired'
      }]
    });
    return; // Important: return here so TS knows nothing is returned
  }

  try {
    await jwtAuthMiddleware(req, res, next);
  } catch (err) {
    console.error('JWT verification failed', err);
    res.status(401).json({
      result: 'error',
      code: 'UNAUTHORIZED_ACCESS_ERROR',
      msg: 'unauthorized access error',
      errors: [{
        code: 'INVALID_TOKEN_ERROR',
        err_msg: 'access token is invalid or expired'
      }]
    });
    return; // Important
  }
};
