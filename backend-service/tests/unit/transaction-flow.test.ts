import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../src/index';
import User from '../../src/models/User';
import { ShardingService } from '../../src/services/ShardingService';

describe('Transaction Flow Tests', () => {
  let authHeader: string;
  let userId: string;
  let shard3: string;
  let currentAddress: string;
  let derivationPath: string;

  beforeAll(async () => {
    // Setup basic auth
    const credentials = Buffer.from('admin:password123').toString('base64');
    authHeader = `Basic ${credentials}`;

    // Connect to MongoDB if not connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/bsv-wallet-service-test');
    }
  });

  beforeEach(async () => {
    // Create a test user
    const testUser = {
      email: 'tx-test@example.com',
      name: 'Transaction Test User'
    };

    const response = await request(app)
      .post('/api/v1/user/create')
      .set('Authorization', authHeader)
      .send(testUser);

    userId = response.body.data.userId;
    shard3 = response.body.data.shard3;
    currentAddress = response.body.data.addresses.current[0].address;
    derivationPath = response.body.data.addresses.current[0].derivationPath;
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({ email: 'tx-test@example.com' });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/v1/wallets/fee-estimates', () => {
    it('should return fee estimates', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/fee-estimates')
        .set('Authorization', authHeader)
        .send({ network: 'testnet' })
        .expect(200);

      expect(response.body.result).toBe('success');
      expect(response.body.data).toHaveProperty('slow');
      expect(response.body.data).toHaveProperty('medium');
      expect(response.body.data).toHaveProperty('fast');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('network');
    });

    it('should default to testnet', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/fee-estimates')
        .set('Authorization', authHeader)
        .send({})
        .expect(200);

      expect(response.body.data.network).toBe('testnet');
    });
  });

  describe('POST /api/v1/wallets/fee-recommendation', () => {
    it('should recommend fast fee for large transactions', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/fee-recommendation')
        .set('Authorization', authHeader)
        .send({
          amount: 200000, // > 100000 to get 'fast' tier
          network: 'testnet'
        })
        .expect(200);

      expect(response.body.result).toBe('success');
      expect(response.body.data).toHaveProperty('recommendedFeeRate');
      expect(response.body.data).toHaveProperty('feeTier');
      expect(response.body.data).toHaveProperty('estimatedTotalFee');
      expect(response.body.data.feeTier).toBe('fast');
    });

    it('should recommend slow fee for small transactions', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/fee-recommendation')
        .set('Authorization', authHeader)
        .send({
          amount: 100,
          network: 'testnet'
        })
        .expect(200);

      expect(response.body.data.feeTier).toBe('slow');
    });
  });

  describe('POST /api/v1/wallets/balance', () => {
    it('should return balance for user', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/balance')
        .set('Authorization', authHeader)
        .send({
          userId: userId,
          network: 'testnet'
        })
        .expect(200);

      expect(response.body.result).toBe('success');
      expect(response.body.data).toHaveProperty('totalBalance');
      expect(response.body.data).toHaveProperty('addresses');
      expect(Array.isArray(response.body.data.addresses)).toBe(true);
    });

    it('should return error if user not found', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/balance')
        .set('Authorization', authHeader)
        .send({
          userId: 'nonexistent-user-id',
          network: 'testnet'
        })
        .expect(404);

      expect(response.body.result).toBe('error');
      expect(response.body.code).toBe('RW_USER_NOT_FOUND');
    });
  });

  describe('POST /api/v1/wallets/send-transaction', () => {
    it('should return error for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/send-transaction')
        .set('Authorization', authHeader)
        .send({
          email: 'tx-test@example.com',
          // Missing: derivationPath, toAddress, amount, shardFromUser
        })
        .expect(400);

      expect(response.body.result).toBe('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should return error if user not found', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/send-transaction')
        .set('Authorization', authHeader)
        .send({
          email: 'nonexistent@example.com',
          derivationPath: derivationPath,
          toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          amount: 1000,
          shardFromUser: shard3,
          network: 'testnet'
        })
        .expect(404);

      expect(response.body.result).toBe('error');
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    it('should return error for invalid shard', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/send-transaction')
        .set('Authorization', authHeader)
        .send({
          email: 'tx-test@example.com',
          derivationPath: derivationPath,
          toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          amount: 1000,
          shardFromUser: 'invalid-shard',
          network: 'testnet'
        })
        .expect(400);

      expect(response.body.result).toBe('error');
    });

    it('should attempt to send transaction (will fail due to no funds)', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/send-transaction')
        .set('Authorization', authHeader)
        .send({
          email: 'tx-test@example.com',
          derivationPath: derivationPath,
          toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          amount: 1000,
          shardFromUser: shard3,
          network: 'testnet'
        });

      // Transaction will fail due to no funds, but structure should be correct
      expect(response.body).toHaveProperty('result');
      
      if (response.body.result === 'error') {
        expect(response.body.code).toBeDefined();
      }
    });

    it('should recover mnemonic from 2 shards correctly', async () => {
      // Get shard1 from database
      const user = await User.findOne({ email: 'tx-test@example.com' });
      const shard1 = user!.shard1;
      
      // Combine shard1 + shard3 to recover mnemonic
      const recoveredMnemonic = ShardingService.recoverMnemonicFromShards(shard1, shard3);
      
      // Mnemonic should be valid
      expect(recoveredMnemonic).toBeTruthy();
      expect(recoveredMnemonic.split(' ')).toHaveLength(12);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('GET /network/status', () => {
    it('should return network status', async () => {
      const response = await request(app)
        .get('/network/status')
        .expect(200);

      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('rpcUrl');
      expect(response.body.data).toHaveProperty('explorerUrl');
    });
  });
});

