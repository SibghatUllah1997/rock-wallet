import { Request, Response, NextFunction } from 'express';

export interface AuthConfig {
  username: string;
  password: string;
  realm?: string;
}

export class BasicAuthMiddleware {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * Basic Authentication middleware
   * Validates username and password from Authorization header
   */
  authenticate = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      this.sendUnauthorized(res);
      return;
    }

    try {
      // Decode base64 encoded credentials
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');

      // Validate credentials
      if (username === this.config.username && password === this.config.password) {
        // Basic auth only sets username for compatibility; JWT auth sets full user object
        // This is only for API-level protection, not user-specific routes
        next();
      } else {
        this.sendUnauthorized(res);
      }
    } catch (error) {
      this.sendUnauthorized(res);
    }
  };

  private sendUnauthorized(res: Response): void {
    res.status(401).json({
      result: 'error',
      code: 'UNAUTHORIZED',
      msg: 'authentication required',
      errors: [{
        code: 'AUTH_REQUIRED_ERROR',
        err_msg: 'Basic authentication required. Provide valid username and password.'
      }]
    });
  }
}

// Default configuration - can be overridden with environment variables
// In production, credentials MUST be set via environment variables
const isProduction = process.env.NODE_ENV === 'production';

let defaultConfig: AuthConfig;
if (isProduction) {
  // Production: Require credentials from environment
  if (!process.env.API_USERNAME || !process.env.API_PASSWORD) {
    throw new Error(
      'API_USERNAME and API_PASSWORD environment variables are required in production. ' +
      'Please set them in your .env file.'
    );
  }
  defaultConfig = {
    username: process.env.API_USERNAME,
    password: process.env.API_PASSWORD,
  realm: 'BSV Wallet API'
};
} else {
  // Development: Allow defaults with warning
  const username = process.env.API_USERNAME || 'admin';
  const password = process.env.API_PASSWORD || 'password123';
  
  if (!process.env.API_USERNAME || !process.env.API_PASSWORD) {
    console.warn('[WARNING] Using default Basic Auth credentials in development.');
    console.warn('  API_USERNAME: admin');
    console.warn('  API_PASSWORD: password123');
    console.warn('  Set API_USERNAME and API_PASSWORD in .env for custom credentials.');
  }
  
  defaultConfig = {
    username,
    password,
    realm: 'BSV Wallet API'
  };
}

// Export configured middleware instance
export const basicAuth = new BasicAuthMiddleware(defaultConfig);
