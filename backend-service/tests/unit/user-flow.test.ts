import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../src/index';
import User from '../../src/models/User';

describe('User Flow Tests', () => {
  let authHeader: string;
  const testUser = {
    email: 'test@example.com',
    name: 'Test User'
  };

  beforeAll(async () => {
    // Setup basic auth
    const credentials = Buffer.from('admin:password123').toString('base64');
    authHeader = `Basic ${credentials}`;

    // Connect to MongoDB if not connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/bsv-wallet-service-test');
    }
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: testUser.email });
    await mongoose.connection.close();
  });

  describe('POST /api/v1/users/create', () => {
    it('should create user wallet successfully', async () => {
      const testUserData = {
        username: 'testuser',
        email: testUser.email,
        password: 'testpass123',
        name: testUser.name
      };
      const response = await request(app)
        .post('/api/v1/users/create')
        .set('Authorization', authHeader)
        .send(testUserData)
        .expect(201);

      expect(response.body.result).toBe('success');
      expect(response.body.code).toBe('RW_CREATED');
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data).toHaveProperty('shard3');
      expect(response.body.data).toHaveProperty('addresses');
      expect(response.body.data).toHaveProperty('xpub');
      expect(response.body.data.addresses).toHaveProperty('saving');
      expect(response.body.data.addresses).toHaveProperty('current');
    });

    it('should return existing user if user already exists', async () => {
      // Create user first
      await request(app)
        .post('/api/v1/user/create')
        .set('Authorization', authHeader)
        .send(testUser);

      // Try to create again - should return existing user
      const response = await request(app)
        .post('/api/v1/users/create')
        .set('Authorization', authHeader)
        .send(testUser)
        .expect(200);

      expect(response.body.result).toBe('success');
      expect(response.body.code).toBe('RW_SUCCESS');
      expect(response.body.data.shard3).toBe(''); // Empty shard3 for existing users
    });

    it('should accept any email format (no email validation)', async () => {
      const uniqueEmail = `test-${Date.now()}@test.com`;
      const uniqueUsername = `testuser-${Date.now()}`;
      const response = await request(app)
        .post('/api/v1/users/create')
        .set('Authorization', authHeader)
        .send({ 
          username: uniqueUsername,
          email: uniqueEmail, 
          password: 'testpass123',
          name: 'Test' 
        })
        .expect(201);

      expect(response.body.result).toBe('success');
      // Clean up
      const user = await User.findOne({ email: uniqueEmail });
      if (user) {
        await User.deleteOne({ email: uniqueEmail });
        await Wallet.deleteOne({ walletId: user.walletId });
      }
    });

    it('should require username, email and password fields', async () => {
      const response = await request(app)
        .post('/api/v1/users/create')
        .set('Authorization', authHeader)
        .send({})
        .expect(400);

      expect(response.body.result).toBe('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should store 2 shards in database', async () => {
      const uniqueEmail = `test-shards-${Date.now()}@example.com`;
      const uniqueUsername = `testuser-${Date.now()}`;
      const newUser = {
        username: uniqueUsername,
        email: uniqueEmail,
        password: 'testpass123',
        name: 'Test User'
      };

      await request(app)
        .post('/api/v1/users/create')
        .set('Authorization', authHeader)
        .send(newUser)
        .expect(201);

      const user = await User.findOne({ email: uniqueEmail });
      expect(user).toBeTruthy();
      const wallet = await Wallet.findOne({ walletId: user!.walletId });
      expect(wallet).toBeTruthy();
      expect(wallet!.shard1).toBeTruthy();
      expect(wallet!.shard2).toBeTruthy();

      // Clean up
      await User.deleteOne({ email: uniqueEmail });
      await Wallet.deleteOne({ walletId: user!.walletId });
    });
  });

  describe('POST /api/v1/wallets/recovery', () => {
    let userId: string;
    let shard3: string;

    beforeEach(async () => {
      // Create a user first
      const response = await request(app)
        .post('/api/v1/users/create')
        .set('Authorization', authHeader)
        .send(testUser);

      userId = response.body.data.userId;
      shard3 = response.body.data.shard3;
    });

    it('should recover user wallet successfully', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/recovery')
        .set('Authorization', authHeader)
        .send({
          email: testUser.email,
          name: testUser.name
        })
        .expect(200);

      expect(response.body.result).toBe('success');
      expect(response.body.data).toHaveProperty('userId', userId);
      expect(response.body.data).toHaveProperty('shard3'); // NEW shard3
      expect(response.body.data).toHaveProperty('xpub');
      expect(response.body.data).toHaveProperty('addresses');
      expect(response.body.data.shard3).not.toBe(shard3); // Should be NEW shard
    });

    it('should regenerate NEW shards', async () => {
      // Get original shards
      const user = await User.findOne({ email: testUser.email });
      const originalShard1 = user!.shard1;
      const originalShard2 = user!.shard2;

      // Recover to get new shards
      await request(app)
        .post('/api/v1/wallets/recovery')
        .set('Authorization', authHeader)
        .send(testUser)
        .expect(200);

      // Get new shards from DB
      const updatedUser = await User.findOne({ email: testUser.email });
      expect(updatedUser!.shard1).not.toBe(originalShard1);
      expect(updatedUser!.shard2).not.toBe(originalShard2);
    });

    it('should return error if user not found', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/recovery')
        .set('Authorization', authHeader)
        .send({
          email: 'nonexistent@example.com',
          name: 'Test'
        })
        .expect(404);

      expect(response.body.result).toBe('error');
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    it('should return error if password is incorrect', async () => {
      const response = await request(app)
        .post('/api/v1/wallets/recovery')
        .set('Authorization', authHeader)
        .send({
          username,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.result).toBe('error');
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });
  });
});

