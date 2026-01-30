import { ShardingManager } from '../../src/core/sharding';
import * as bip39 from 'bip39';

describe('ShardingManager', () => {
  let testMnemonic: string;

  beforeAll(() => {
    testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  });

  describe('splitMnemonic', () => {
    it('should split mnemonic into 3 shards', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      
      expect(result.shards).toHaveLength(3);
      expect(result.threshold).toBe(2);
      expect(result.totalShares).toBe(3);
    });

    it('should generate different shards for different mnemonics', () => {
      const mnemonic1 = bip39.generateMnemonic();
      const mnemonic2 = bip39.generateMnemonic();
      
      const result1 = ShardingManager.splitMnemonic(mnemonic1);
      const result2 = ShardingManager.splitMnemonic(mnemonic2);
      
      expect(result1.shards).not.toEqual(result2.shards);
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => ShardingManager.splitMnemonic('invalid mnemonic')).toThrow();
    });
  });

  describe('combineShards', () => {
    it('should reconstruct mnemonic from 2 shards', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      const reconstructed = ShardingManager.combineShards([result.shards[0], result.shards[1]]);
      
      expect(reconstructed).toBe(testMnemonic);
    });

    it('should reconstruct mnemonic from any 2 shards', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      
      // Test all combinations of 2 shards
      const combinations = [
        [result.shards[0], result.shards[1]],
        [result.shards[0], result.shards[2]],
        [result.shards[1], result.shards[2]]
      ];

      combinations.forEach(shards => {
        const reconstructed = ShardingManager.combineShards(shards);
        expect(reconstructed).toBe(testMnemonic);
      });
    });

    it('should throw error for wrong number of shards', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      
      expect(() => ShardingManager.combineShards([result.shards[0]])).toThrow();
      expect(() => ShardingManager.combineShards(result.shards)).toThrow();
      expect(() => ShardingManager.combineShards([])).toThrow();
    });

    it('should throw error for invalid shards', () => {
      expect(() => ShardingManager.combineShards(['invalid', 'shards'])).toThrow();
    });
  });

  describe('recoverShards', () => {
    it('should generate new 3 shards from 2 existing shards', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      const recovery = ShardingManager.recoverShards([result.shards[0], result.shards[1]]);
      
      expect(recovery.shards).toHaveLength(3);
      expect(recovery.threshold).toBe(2);
      expect(recovery.totalShares).toBe(3);
      
      // Verify the recovered shards can reconstruct the original mnemonic
      const reconstructed = ShardingManager.combineShards([recovery.shards[0], recovery.shards[1]]);
      expect(reconstructed).toBe(testMnemonic);
    });

    it('should generate different shards on recovery', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      const recovery = ShardingManager.recoverShards([result.shards[0], result.shards[1]]);
      
      expect(recovery.shards).not.toEqual(result.shards);
    });
  });

  describe('validateShard', () => {
    it('should validate correct shard format', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      
      result.shards.forEach(shard => {
        expect(ShardingManager.validateShard(shard)).toBe(true);
      });
    });

    it('should reject invalid shard formats', () => {
      expect(ShardingManager.validateShard('')).toBe(false);
      expect(ShardingManager.validateShard('invalid')).toBe(false);
      expect(ShardingManager.validateShard('123xyz')).toBe(false);
    });
  });

  describe('validateShards', () => {
    it('should validate array of shards', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      expect(ShardingManager.validateShards(result.shards)).toBe(true);
    });

    it('should reject invalid shard arrays', () => {
      expect(ShardingManager.validateShards([])).toBe(false);
      expect(ShardingManager.validateShards(['invalid'])).toBe(false);
      expect(ShardingManager.validateShards(['valid', 'invalid'])).toBe(false);
    });
  });

  describe('getShardInfo', () => {
    it('should return correct shard information', () => {
      const result = ShardingManager.splitMnemonic(testMnemonic);
      const info = ShardingManager.getShardInfo(result.shards);
      
      expect(info.count).toBe(3);
      expect(info.threshold).toBe(2);
      expect(info.valid).toBe(true);
    });
  });
});
