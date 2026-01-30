// CRITICAL: Load environment variables FIRST, before any other imports
// This ensures all modules have access to process.env when they're imported
import dotenv from 'dotenv';
import path from 'path';


// Load environment variables from backend-service/.env
// Note: dotenv.config() will NOT override existing process.env variables
// So exported environment variables take precedence over .env file values
// This allows flexibility: use .env file OR export variables directly
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

// Log encryption key status at startup (only show length in production, full details in dev)
const encryptionKey = process.env.SHARD_ENCRYPTION_KEY;
if (encryptionKey) {
  console.log(`[Server Startup] ✓ SHARD_ENCRYPTION_KEY loaded from ${envPath}`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Server Startup]   Key length: ${encryptionKey.length} chars, preview: ${encryptionKey.substring(0, 10)}...${encryptionKey.substring(encryptionKey.length - 5)}`);
  } else {
    console.log(`[Server Startup]   Key length: ${encryptionKey.length} chars`);
  }
} else {
  console.error(`[Server Startup] ✗ WARNING: SHARD_ENCRYPTION_KEY not found in environment!`);
  console.error(`[Server Startup]   Tried to load from: ${envPath}`);
}

// Now import everything else AFTER .env is loaded
import './types/express';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import fs from 'fs';

// Import routes (controllers will now be created with access to process.env)
import walletRoutes from './routes/walletRoutes';
// Recovery route moved to userRoutes.ts at /api/v1/users/recovery (JWT-based)
// Old walletRecoveryRoutes is deprecated - use /api/v1/users/recovery instead
import userRoutes from './routes/userRoutes';
import userTransactionRoutes from './routes/userTransactionRoutes';
import transactionRoutes from './routes/transactionRoutes';
import balanceRoutes from './routes/balanceRoutes';
import addressRoutes from './routes/addressRoutes';
import feeRoutes from './routes/feeRoutes';
import authRoutes from './routes/authRoutes';
import { setupSwagger } from './swagger/swaggerConfig';
import mpcRoutes from './routes/mpcRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(morgan(process.env.LOG_FORMAT || 'combined'));
// JSON body parser with error handling for malformed JSON
app.use(express.json({ 
  limit: '10mb',
  strict: true
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       500:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * @swagger
 * /network/status:
 *   get:
 *     summary: Get network status
 *     description: Returns the current status of the BSV network including block height, fee rates, and connection status
 *     tags: [Network]
 *     responses:
 *       200:
 *         description: Network status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/NetworkStatus'
 *       500:
 *         description: Failed to get network status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/network/status', async (req, res) => {
  try {
    const { BSVService } = await import('./services/BSVService');
    const isTestnet = process.env.BSV_NETWORK !== 'mainnet';
    const bsvService = new BSVService(isTestnet);
    const networkStatus = await bsvService.checkNetworkStatus();
    
    res.status(200).json({
      result: 'success',
      code: 'RW_SUCCESS',
      msg: 'network status retrieved',
      data: networkStatus
    });
  } catch (error) {
    res.status(500).json({
      result: 'error',
      code: 'NETWORK_ERROR',
      msg: 'failed to get network status',
      errors: [{
        code: 'NETWORK_STATUS_ERROR',
        err_msg: error instanceof Error ? error.message : 'Unknown error'
      }]
    });
  }
});

// API routes
const apiVersion = process.env.API_VERSION || 'v1';
app.use(`/api/${apiVersion}/auth`, authRoutes); // Authentication routes (login, logout, refresh)
app.use(`/api/${apiVersion}/wallets`, walletRoutes); // Wallet routes including recovery at /wallets/recovery
app.use(`/api/${apiVersion}/wallets`, feeRoutes); // Fee estimation routes (legacy)
app.use(`/api/${apiVersion}/users`, feeRoutes); // Fee estimation routes (user-based)
app.use(`/api/${apiVersion}/users`, userRoutes); // User routes
app.use(`/api/${apiVersion}/users`, userTransactionRoutes); // User-based transaction and balance routes
app.use(`/api/${apiVersion}/wallets`, transactionRoutes);
app.use(`/api/${apiVersion}/wallets`, balanceRoutes);
app.use(`/api/${apiVersion}/wallets`, addressRoutes);
app.use('/rwcore/api/v1/mpc', mpcRoutes);

// Setup Swagger documentation
setupSwagger(app);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    result: 'error',
    code: 'NOT_FOUND',
    msg: 'endpoint not found',
    errors: [{
      code: 'ENDPOINT_NOT_FOUND_ERROR',
      err_msg: `Endpoint ${req.method} ${req.originalUrl} not found`
    }]
  });
});

// Error handling middleware (must be after routes)
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Handle JSON parsing errors
  if (error instanceof SyntaxError && 'body' in error) {
    console.error('JSON parsing error:', error.message);
    // Try to fix common JSON issues - trailing characters after closing brace
    if (error.body && typeof error.body === 'string') {
      try {
        // Remove trailing non-whitespace characters after closing brace
        const cleaned = error.body.trim().replace(/}([^\s]*)$/, '}').trim();
        req.body = JSON.parse(cleaned);
        return next();
      } catch (parseErr) {
        // If cleaning fails, return error
      }
    }
    return res.status(400).json({
      result: 'error',
      code: 'INVALID_JSON',
      msg: 'invalid JSON format',
      errors: [{
        code: 'JSON_PARSE_ERROR',
        err_msg: 'Request body contains invalid JSON. Please check for trailing characters or special characters after the closing brace.'
      }]
    });
  }
  
  // Handle other errors
  console.error('Unhandled error:', error);
  res.status(500).json({
    result: 'error',
    code: 'INTERNAL_ERROR',
    msg: 'internal server error',
    errors: [{
      code: 'UNHANDLED_ERROR',
      err_msg: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    }]
  });
});

// Connect to MongoDB / Amazon DocumentDB
const connectToDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    // MongoDB connection options (Mongoose 8+ automatically manages parser/topology options)
    const mongooseOptions: any = {};

    // Determine whether TLS/SSL should be used (DocumentDB or SSL-enabled MongoDB)
    const envTlsFlag = (process.env.MONGODB_USE_TLS || '').toLowerCase() === 'true';
    const uriIndicatesTls = mongoUri.includes('ssl=true') || mongoUri.includes('tls=true') || mongoUri.includes('docdb');
    const shouldUseTls = envTlsFlag || uriIndicatesTls;

    // Build list of candidate CA certificate paths (in priority order)
    const candidateCaPaths = [
      process.env.MONGODB_CA_PATH,
      path.join(__dirname, '../rds-combined-ca-bundle.pem')
    ].filter(Boolean);

    const existingCaPath = candidateCaPaths.find((filePath) => fs.existsSync(filePath));

    if (shouldUseTls) {
      if (existingCaPath) {
        try {
          mongooseOptions.tls = true;
          mongooseOptions.tlsCAFile = existingCaPath;
          console.log(`✅ Using TLS certificate from: ${existingCaPath}`);
        } catch (caError) {
          console.error(`❌ Failed to configure TLS using CA file ${existingCaPath}:`, caError);
          throw new Error('Failed to configure TLS for MongoDB connection');
        }
      } else {
        const errorMessage = 'TLS/SSL requested but no CA certificate file was found. Set MONGODB_CA_PATH to a valid file.';
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }
    } else {
      console.log('ℹ️  Connecting to MongoDB without TLS (standard MongoDB connection)');
    }

    await mongoose.connect(mongoUri, mongooseOptions);

    console.log('✅ Connected to MongoDB / DocumentDB');

    // Start server only if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => {
        console.log(`🚀 BSV Wallet Backend Service running on port ${PORT}`);
        console.log(`📡 API Version: ${apiVersion}`);
        console.log(`🌐 Network: ${process.env.BSV_NETWORK || 'testnet'}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`🔗 API Base URL: http://localhost:${PORT}/api/${apiVersion}`);
      });
    }

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

// Start the application
connectToDatabase();

export default app;
export { app };
