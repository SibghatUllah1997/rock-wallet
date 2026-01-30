import * as crypto from 'crypto';
import * as secrets from 'secrets.js-grempe';
import * as bip39 from 'bip39';
import { BSVSDK } from '../../../bsv-sdk/dist/index';

export interface ShardingResult {
  shards: string[];
  threshold: number;
  totalShares: number;
}

export interface WalletShardingData {
  walletId: string;
  mnemonic: string;
  xpub: string;
  shard1: string; // Stored in DB
  shard2: string; // Stored in DB
  shard3: string; // Returned to client
}

export interface RecoveryData {
  walletId: string;
  xpub: string;
  shard1: string; // From DB
  shard2: string; // From DB
  shard3: string; // From client request
}

export class ShardingService {
  private static readonly DEFAULT_THRESHOLD = 2;
  private static readonly DEFAULT_SHARES = 3;

  /**
   * Generate mnemonic and split into shards (for legacy wallets)
   * Generates account-level xpub (m/44'/coinType'/0')
   */
  static generateWalletWithShards(): WalletShardingData {
    // Generate mnemonic
    const mnemonic = bip39.generateMnemonic(128);
    
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Generated invalid mnemonic');
    }

    // Convert mnemonic to hex for Shamir Secret Sharing
    const hexMnemonic = Buffer.from(mnemonic, 'utf8').toString('hex');
    
    // Split into 3 shards using Shamir Secret Sharing (2/3 threshold)
    const sharesHex = secrets.share(hexMnemonic, this.DEFAULT_SHARES, this.DEFAULT_THRESHOLD);
    const shards = sharesHex.map(share => share.toString());

    // Generate xPub at account level (for legacy wallets)
    const xpub = this.generateXPub(mnemonic);

    // Generate wallet ID
    const walletId = crypto.randomUUID();

    return {
      walletId,
      mnemonic,
      xpub,
      shard1: shards[0], // Store in DB (plain)
      shard2: shards[1], // Store in DB (plain)
      shard3: shards[2] // Return to client
    };
  }

  /**
   * Generate mnemonic and split into shards (for MPC wallets)
   * Generates root-level xpub (master key at root "m") per requirements
   */
  static generateMpcWalletWithShards(): WalletShardingData {
    // Generate mnemonic
    const mnemonic = bip39.generateMnemonic(128);
    
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Generated invalid mnemonic');
    }

    // Convert mnemonic to hex for Shamir Secret Sharing
    const hexMnemonic = Buffer.from(mnemonic, 'utf8').toString('hex');
    
    // Split into 3 shards using Shamir Secret Sharing (2/3 threshold)
    const sharesHex = secrets.share(hexMnemonic, this.DEFAULT_SHARES, this.DEFAULT_THRESHOLD);
    const shards = sharesHex.map(share => share.toString());

    // Generate root-level xPub (master key at root "m") per requirements
    const xpub = this.generateRootXPub(mnemonic);

    // Generate wallet ID
    const walletId = crypto.randomUUID();

    return {
      walletId,
      mnemonic,
      xpub,
      shard1: shards[0], // Store in DB (plain)
      shard2: shards[1], // Store in DB (plain)
      shard3: shards[2] // Return to client
    };
  }

  /**
   * Recover mnemonic from 2 shards (for 2-of-3 threshold)
   * Can use 2 shards from DB, or 1 from DB + 1 from client
   */
  static recoverMnemonicFromShards(shard1: string, shard2: string): string {
    try {
      // Combine the two shards to reconstruct mnemonic (both are plain text)
      const hexMnemonic = secrets.combine([shard1, shard2]);
      let mnemonic = Buffer.from(hexMnemonic, 'hex').toString('utf8');
      
      // Handle padding (backward compatibility)
      if (mnemonic.includes('\0')) {
        mnemonic = mnemonic.replace(/\0+$/, '');
      }
      
      // Validate the reconstructed mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic reconstructed from shards');
      }
      
      return mnemonic;
    } catch (error) {
      throw new Error(`Failed to recover mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate shard format
   */
  static validateShard(shard: string): boolean {
    try {
      return /^[0-9a-fA-F]+$/.test(shard) && shard.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generate xPub from mnemonic using BSV SDK (account-level)
   * Used for legacy wallet creation
   */
  private static generateXPub(mnemonic: string): string {
    // Use BSV SDK to generate proper xpub at account level
    // Default to testnet if BSV_NETWORK is not set
    const isTestnet = process.env.BSV_NETWORK === 'testnet' || process.env.BSV_NETWORK === undefined;
    
    const sdk = new BSVSDK({
      isTestnet: isTestnet,
      maxAddresses: 100000,
      feeRate: 5
    });
    
    const xpubResult = sdk.generateXPub(mnemonic, 0);
    return xpubResult.xpub;
  }

  /**
   * Generate root-level xPub from mnemonic (master key at root "m")
   * Used for MPC wallet creation per requirements
   */
  private static generateRootXPub(mnemonic: string): string {
    // Use BSV SDK to generate root-level xpub (master key at root "m")
    // Default to testnet if BSV_NETWORK is not set
    const isTestnet = process.env.BSV_NETWORK === 'testnet' || process.env.BSV_NETWORK === undefined;
    
    const sdk = new BSVSDK({
      isTestnet: isTestnet,
      maxAddresses: 100000,
      feeRate: 5
    });
    
    const xpubResult = sdk.generateRootXPub(mnemonic);
    return xpubResult.xpub;
  }

  /**
   * Create new shards from existing mnemonic (for recovery scenarios)
   */
  static createNewShards(mnemonic: string): ShardingResult {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic for shard creation');
    }

    const hexMnemonic = Buffer.from(mnemonic, 'utf8').toString('hex');
    const sharesHex = secrets.share(hexMnemonic, this.DEFAULT_SHARES, this.DEFAULT_THRESHOLD);
    const shards = sharesHex.map(share => share.toString());

    return {
      shards,
      threshold: this.DEFAULT_THRESHOLD,
      totalShares: this.DEFAULT_SHARES
    };
  }
}
