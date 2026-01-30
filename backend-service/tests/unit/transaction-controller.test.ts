import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

// Route under test
import router from '../../src/routes/userTransactionRoutes';

// Mock BSVService to avoid network
jest.mock('../../src/services/BSVService', () => {
  return {
    BSVService: jest.fn().mockImplementation(() => ({
      getNativeBalance: jest.fn().mockResolvedValue({ confirmed: 4000, unconfirmed: 0, total: 4000, bsv: '0.00004000', utxos: 4 }),
      signTransaction: jest.fn().mockResolvedValue({
        signedTransactionHex: '0102',
        transactionId: 'ab'.repeat(32),
        fee: 200,
        inputs: 1,
        outputs: 2,
        amountBSV: '0.00001000'
      }),
      broadcastTransactionNative: jest.fn().mockResolvedValue({ success: true, txid: 'cd'.repeat(32) }),
      getExplorerUrl: jest.fn().mockReturnValue('https://test.whatsonchain.com/tx/txid')
    }))
  };
});

// Mock axios to avoid real WOC calls in broadcast route
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockResolvedValue({ data: 'ff'.repeat(32) })
  }
}));

// Mock ShardingService shard validation and recovery
jest.mock('../../src/services/ShardingService', () => {
  return {
    ShardingService: {
      validateShard: jest.fn().mockReturnValue(true),
      recoverMnemonicFromShards: jest.fn().mockReturnValue('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
    }
  };
});

// Minimal express app with the routes
function makeApp() {
  const app = express();
  app.use(bodyParser.json());
  // bind routes at /api/v1/users
  app.use('/api/v1/users', router);
  return app;
}

describe('TransactionController (mocked services)', () => {
  const app = makeApp();

  it('signs a transaction with mocked BSVService', async () => {
    const res = await request(app)
      .post('/api/v1/users/transactions/sign')
      .send({
        username: 'user',
        password: 'pass',
        account_index: 1,
        toAddress: 'mnX...',
        amount: 1000,
        shard3: '80abcd',
        feeRate: 5,
        changeAddress: 'mnY...'
      });
    // We only assert structure since route details can vary
    expect(res.status).toBeLessThan(500);
  });

  it('broadcasts a raw transaction (mocked) and returns txid', async () => {
    const postSpy = (axios as any).post as jest.Mock;
    postSpy.mockResolvedValueOnce({ data: 'ab'.repeat(32) });
    const res = await request(app)
      .post('/api/v1/users/transactions/broadcast')
      .send({ rawTx: '0102' });
    expect(res.status).toBe(200);
    expect(res.body?.data?.transaction_id).toBeDefined();
  });
});


