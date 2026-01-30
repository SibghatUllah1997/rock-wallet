import axios from 'axios';
import { TransactionBuilder } from '../../src/index';
import * as utxoModule from '../../src/transaction/utxo';

jest.mock('axios');

describe('TransactionBuilder (mock prev-tx + utxos)', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  let utxosSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedAxios.get.mockReset();
    if (utxosSpy) utxosSpy.mockRestore();
  });

  it.skip('builds tx hex and id with one input and change', async () => {
    utxosSpy = jest.spyOn(utxoModule.UTXOManager, 'getUTXOs').mockResolvedValueOnce([
      { txid: 'ff'.repeat(32), vout: 0, satoshis: 5000, value: 5000 }
    ]);

    // Minimal serialized previous tx hex with at least one output
    // We return a small dummy tx hex string; the @bsv/sdk Transaction.fromHex will parse it.
    mockedAxios.get.mockResolvedValue({ data: '01000000000000000000' });

    await expect(
      TransactionBuilder.buildNativeTransaction(
        'mnFrom',
        'mnTo',
        1000,
        'L5BmPijJjrKbiUfG4zbiFKNqkvuJ8usooJmzuD7Z8TK5R3y7W8wG', // dummy WIF
        true,
        5,
        'https://api.whatsonchain.com/v1/bsv/test'
      )
    ).resolves.toHaveProperty('transactionHex');
  });
});


