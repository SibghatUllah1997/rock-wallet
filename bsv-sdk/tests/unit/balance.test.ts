import { BalanceManager, UTXOManager } from '../../src/index';

jest.mock('../../src/transaction/utxo', () => {
  const actual = jest.requireActual('../../src/transaction/utxo');
  return {
    ...actual,
    UTXOManager: {
      ...actual.UTXOManager,
      getUTXOs: jest.fn()
    }
  };
});

describe('BalanceManager (mocked UTXOs)', () => {
  const mockedGetUTXOs = UTXOManager.getUTXOs as jest.Mock;

  beforeEach(() => {
    mockedGetUTXOs.mockReset();
  });

  it('sums confirmed balance from WOC unspent response (treated as confirmed)', async () => {
    mockedGetUTXOs.mockResolvedValueOnce([
      { txid: 'a', vout: 0, satoshis: 1000 },
      { txid: 'b', vout: 1, satoshis: 2000 },
      { txid: 'c', vout: 2, satoshis: 1000 }
    ]);

    const res = await BalanceManager.getNativeBalance('mnTest', true, 'https://api.whatsonchain.com/v1/bsv/test');
    expect(res.confirmed).toBe(4000);
    expect(res.unconfirmed).toBe(0);
    expect(res.total).toBe(4000);
    expect(res.utxos).toBe(3);
    expect(res.bsv).toBe('0.00004000');
  });

  it('validateBalance detects insufficient funds against confirmed-only', async () => {
    mockedGetUTXOs.mockResolvedValueOnce([{ txid: 'a', vout: 0, satoshis: 500 }]);
    const res = await BalanceManager.validateBalance('mnTest', 600, false, undefined, true, 'https://api.whatsonchain.com/v1/bsv/test');
    expect(res.isValid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Insufficient BSV balance/);
  });
});


