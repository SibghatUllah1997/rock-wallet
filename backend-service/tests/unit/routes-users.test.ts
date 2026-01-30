import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import router from '../../src/routes/userTransactionRoutes';

// Mock the dependent controllers to avoid DB and network
jest.mock('../../src/controllers/BalanceController', () => {
  return {
    BalanceController: jest.fn().mockImplementation(() => ({
      getBalanceForUser: (req: any, res: any) => res.status(200).json({ result: 'success', code: 'RW_SUCCESS', data: { accounts: [], total: 0 } })
    }))
  };
});

jest.mock('../../src/controllers/WalletController', () => {
  return {
    WalletController: jest.fn().mockImplementation(() => ({
      getPortfoliosForUser: (req: any, res: any) => res.status(200).json({ result: 'success', code: 'RW_SUCCESS', data: { portfolios: [] } })
    }))
  };
});

jest.mock('../../src/controllers/AddressController', () => {
  return {
    AddressController: jest.fn().mockImplementation(() => ({
      getAddressesForUser: (req: any, res: any) => res.status(200).json({ result: 'success', code: 'RW_SUCCESS', data: { addresses: [] } })
    }))
  };
});

function timeIt<T>(label: string, fn: () => Promise<T>) {
  const start = Date.now();
  return fn().then((r) => {
    // eslint-disable-next-line no-console
    console.log(`[timing] ${label}: ${Date.now() - start}ms`);
    return r;
  });
}

function makeApp() {
  const app = express();
  app.use(bodyParser.json());
  app.use('/api/v1/users', router);
  return app;
}

describe('Users route bundle (mocked controllers)', () => {
  const app = makeApp();

  it('GET portfolios (mocked)', async () => {
    const res = await timeIt('portfolios', () => request(app)
      .post('/api/v1/users/portfolios')
      .send({ username: 'x', password: 'y' }));
    expect(res.status).toBe(200);
    expect(res.body?.result).toBe('success');
  });

  it('GET addresses (mocked)', async () => {
    const res = await timeIt('addresses', () => request(app)
      .post('/api/v1/users/addresses')
      .send({ username: 'x', password: 'y' }));
    expect(res.status).toBe(200);
    expect(res.body?.result).toBe('success');
  });

  it('GET balance (mocked)', async () => {
    const res = await timeIt('balance', () => request(app)
      .post('/api/v1/users/balance')
      .send({ username: 'x', password: 'y' }));
    expect(res.status).toBe(200);
    expect(res.body?.result).toBe('success');
  });
});


