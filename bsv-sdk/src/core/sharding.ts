import * as bip39 from 'bip39';
import * as secrets from 'secrets.js-grempe';

export interface ShardingResult {
  shards: string[];
  threshold: number;
  totalShares: number;
}

export interface RecoveryResult {
  shards: string[];
  threshold: number;
  totalShares: number;
}

/**
 * Shamir Secret Sharing implementation for BSV SDK
 * Provides 2/3 threshold sharding with recovery functionality
 */
export class ShardingManager {
  private static readonly DEFAULT_THRESHOLD = 2;
  private static readonly DEFAULT_SHARES = 3;

  /**
   * Split mnemonic into 3 shards using Shamir Secret Sharing (2/3 threshold)
   * @param mnemonic - BIP39 mnemonic phrase
   * @returns ShardingResult with 3 shards
   */
  static splitMnemonic(mnemonic: string): ShardingResult {
    // Validate mnemonic first
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Convert mnemonic to hex for Shamir Secret Sharing
    const hexMnemonic = Buffer.from(mnemonic, 'utf8').toString('hex');
    
    const sharesHex = secrets.share(hexMnemonic, this.DEFAULT_SHARES, this.DEFAULT_THRESHOLD);
    const shardArray = sharesHex.map(share => share.toString());
    
    return {
      shards: shardArray,
      threshold: this.DEFAULT_THRESHOLD,
      totalShares: this.DEFAULT_SHARES
    };
  }

  /**
   * Combine 2 shards to reconstruct mnemonic
   * @param shards - Array of exactly 2 shards
   * @returns Reconstructed mnemonic
   */
  static combineShards(shards: string[]): string {
    if (shards.length !== 2) {
      throw new Error('Exactly 2 shards are required for reconstruction');
    }

    try {
      const hexMnemonic = secrets.combine(shards);
      let mnemonic = Buffer.from(hexMnemonic, 'hex').toString('utf8');
      
      // Handle both old (padded) and new (unpadded) formats for backward compatibility
      if (mnemonic.includes('\0')) {
        // Old format with padding - remove padding
        mnemonic = mnemonic.replace(/\0+$/, '');
      }
      
      // Validate the reconstructed mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase reconstructed from shards');
      }
      
      return mnemonic;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to reconstruct mnemonic from shards: ${errorMessage}`);
    }
  }

  /**
   * Recovery function: Accept 2 shards and return 3 shards
   * This allows for shard rotation and recovery scenarios
   * @param shards - Array of exactly 2 shards
   * @returns RecoveryResult with 3 new shards
   */
  static recoverShards(shards: string[]): RecoveryResult {
    // First reconstruct the mnemonic from 2 shards
    const reconstructedMnemonic = this.combineShards(shards);
    
    // Then create new 3 shards from the reconstructed mnemonic
    return this.splitMnemonic(reconstructedMnemonic);
  }

  /**
   * Validate if a string is a valid shard
   * @param shard - Shard string to validate
   * @returns True if valid shard format
   */
  static validateShard(shard: string): boolean {
    try {
      // Basic validation - shard should be a hex string
      return /^[0-9a-fA-F]+$/.test(shard) && shard.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Validate array of shards
   * @param shards - Array of shards to validate
   * @returns True if all shards are valid
   */
  static validateShards(shards: string[]): boolean {
    if (!Array.isArray(shards) || shards.length === 0) {
      return false;
    }
    
    return shards.every(shard => this.validateShard(shard));
  }

  /**
   * Get shard information
   * @param shards - Array of shards
   * @returns Object with shard count and threshold info
   */
  static getShardInfo(shards: string[]): { count: number; threshold: number; valid: boolean } {
    return {
      count: shards.length,
      threshold: this.DEFAULT_THRESHOLD,
      valid: this.validateShards(shards)
    };
  }
}
