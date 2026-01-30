import axios from 'axios';

const RUN_REAL = process.env.RUN_REAL === '1';

describe('WOC real GET (gated)', () => {
  (RUN_REAL ? it : it.skip)('fetches a known testnet address unspent list', async () => {
    const base = process.env.BSV_RPC_URL || 'https://api.whatsonchain.com/v1/bsv/test';
    const addr = 'mnXDFYAbx7oEXi5BPfMKjUthDEFsvia4zE';
    const { data, status } = await axios.get(`${base}/address/${addr}/unspent`, { timeout: 8000 });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  (RUN_REAL ? it : it.skip)('fetches fee estimates (if exposed)', async () => {
    const base = process.env.BSV_RPC_URL || 'https://api.whatsonchain.com/v1/bsv/test';
    const { status } = await axios.get(`${base}/chain/info`, { timeout: 8000 });
    expect(status).toBe(200);
  });
});


