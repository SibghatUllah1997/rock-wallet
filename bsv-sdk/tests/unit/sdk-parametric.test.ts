import { BSVSDK, BalanceManager, TransactionBuilder, UTXOManager } from '../../src/index';

// Mock UTXOManager network calls
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

function timeIt<T>(label: string, fn: () => Promise<T> | T) {
  const started = Date.now();
  return Promise.resolve()
    .then(() => fn())
    .then((result) => {
      const elapsed = Date.now() - started;
      // eslint-disable-next-line no-console
      console.log(`[timing] ${label}: ${elapsed}ms`);
      return result;
    });
}

describe('SDK parametric coverage with timing', () => {
  const mockedGetUTXOs = (UTXOManager.getUTXOs as unknown) as jest.Mock;

  beforeEach(() => {
    mockedGetUTXOs.mockReset();
  });

  test.each(Array.from({ length: 20 }, (_, i) => i))('derivation testnet index %p', async (idx) => {
    const sdk = new BSVSDK({ isTestnet: true });
    await timeIt(`derive testnet index ${idx}`, async () => {
      const kp = sdk.generateKeyPairAtIndex('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', idx, 0, 'p2pkh');
      expect(kp.address).toBeTruthy();
      expect(kp.publicKey).toMatch(/^02|03/);
    });
  });

  test.each([
    0,
    1,
    10,
    546,
    1000,
    123456,
    100000000,
    2500000000,
    9999999999,
    42
  ])('satoshi<->bsv conversions %p', async (sats) => {
    await timeIt(`convert ${sats} sats`, async () => {
      const bsv = BalanceManager.satoshisToBSV(sats);
      const back = BalanceManager.bsvToSatoshis(bsv);
      expect(typeof bsv).toBe('string');
      expect(typeof back).toBe('number');
      // allow rounding differences within 1 sat
      expect(Math.abs(back - sats)).toBeLessThanOrEqual(1);
    });
  });

  // Early small batch of address validations to mix output
  test.each([
    '',
    'abc',
    'mnInvalidAddress',
    '1BoatSLRHtKNngkdXEeobR76b53LETtpyT'
  ])('address validation invalid (early mix) %#', async (addr) => {
    const sdk = new BSVSDK({ isTestnet: true });
    const ok = await timeIt(`validateAddress ${addr}`, () => Promise.resolve(sdk.validateAddress(String(addr).trim())));
    expect(ok).toBe(false);
  });

  test.each([
    [1, 1, 1],
    [1, 2, 3],
    [2, 2, 5],
    [3, 2, 3],
    [5, 5, 10],
    [10, 2, 1],
    [15, 2, 5],
    [20, 2, 3],
    [30, 2, 5]
  ])('fee estimation inputs=%p outputs=%p feeRate=%p', async (inputs, outputs, feeRate) => {
    await timeIt(`estimateFee ${inputs}/${outputs}@${feeRate}`, async () => {
      const fee = TransactionBuilder.estimateFee(inputs as number, outputs as number, feeRate as number);
      expect(fee).toBeGreaterThan(0);
    });
  });

  test.each([
    { utxos: [1000, 2000], want: 2500, ok: true },
    { utxos: [500], want: 600, ok: false },
    { utxos: [3000, 3000], want: 5500, ok: true },
    { utxos: [200, 200, 200], want: 600, ok: true },
    { utxos: [200, 200, 200], want: 700, ok: false }
  ])('validateBalance confirmed-only %#', async ({ utxos, want, ok }) => {
    mockedGetUTXOs.mockResolvedValueOnce(utxos.map((v: number, i: number) => ({ txid: String(i), vout: 0, satoshis: v })));
    const res = await timeIt(`validateBalance ${want}`, () => BalanceManager.validateBalance('addr', want, false, undefined, true, 'https://api.whatsonchain.com/v1/bsv/test'));
    expect(res.isValid).toBe(ok);
  });

  test.each(Array.from({ length: 20 }, (_, i) => i))('derivation mainnet index %p', async (idx) => {
    const sdk = new BSVSDK({ isTestnet: false });
    await timeIt(`derive mainnet index ${idx}`, async () => {
      const kp = sdk.generateKeyPairAtIndex('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', idx, 0, 'p2pkh');
      expect(kp.address).toBeTruthy();
      expect(kp.publicKey).toMatch(/^02|03/);
    });
  });

  test.each([
    '  mnTest  ',
    'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    '1111111111111111111114oLvT2',
    'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
    'tb1qxyz'
  ])('address validation invalid %#', async (addr) => {
    const sdk = new BSVSDK({ isTestnet: true });
    const ok = await timeIt(`validateAddress ${addr}`, () => Promise.resolve(sdk.validateAddress(String(addr).trim())));
    expect(ok).toBe(false);
  });

  test.each([
    '0000000000000000000000000000000000000000000000000000000000000000',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  ])('explorer URL generation %p', async (txid) => {
    const sdk = new BSVSDK({ isTestnet: true, explorerUrl: 'https://test.whatsonchain.com' });
    await timeIt(`explorer url ${txid.slice(0, 8)}`, async () => {
      const url = sdk.getExplorerUrl(txid);
      expect(typeof url).toBe('string');
      expect(url).toContain(txid.slice(0, 8));
    });
  });

  // Final mixers to ensure tail output isn't only address logs
  it('final mix fee: 7 inputs / 3 outputs @ 5 sat/B', async () => {
    await timeIt('final estimateFee 7/3@5', async () => {
      const fee = TransactionBuilder.estimateFee(7, 3, 5);
      expect(fee).toBeGreaterThan(0);
    });
  });

  it('final mix convert: 314159 sats', async () => {
    await timeIt('final convert 314159 sats', async () => {
      const bsv = BalanceManager.satoshisToBSV(314159);
      const back = BalanceManager.bsvToSatoshis(bsv);
      expect(Math.abs(back - 314159)).toBeLessThanOrEqual(1);
    });
  });
});


