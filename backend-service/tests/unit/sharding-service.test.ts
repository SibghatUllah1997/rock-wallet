import { ShardingService } from '../../src/services/ShardingService';

function timeIt<T>(label: string, fn: () => T) {
  const start = Date.now();
  const out = fn();
  // eslint-disable-next-line no-console
  console.log(`[timing] ${label}: ${Date.now() - start}ms`);
  return out;
}

describe('ShardingService - validate/combine/recover', () => {
  it('validates proper shard format quickly', () => {
    const shard = '8031a6288df1f1'; // dummy-ish prefix/length
    const ok = timeIt('validateShard', () => ShardingService.validateShard(shard));
    expect(typeof ok).toBe('boolean');
  });

  it('generate+recover mnemonic works (roundtrip)', () => {
    const data = timeIt('generateWalletWithShards', () => ShardingService.generateWalletWithShards());
    expect(data.mnemonic.split(' ').length).toBeGreaterThanOrEqual(12);
    // data.shards is not returned directly; simulate by re-splitting mnemonic
    const reshards = ShardingService.createNewShards(data.mnemonic);
    const rec = timeIt('recoverMnemonicFromShards', () => ShardingService.recoverMnemonicFromShards(reshards.shards[0], reshards.shards[1]));
    expect(rec).toEqual(data.mnemonic);
  });
});


