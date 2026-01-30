import * as crypto from 'crypto';

/**
 * Encryption Service for Shard Encryption/Decryption
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  private encryptionKey: Buffer;
  private algorithm: string = 'aes-256-gcm';
  private ivLength: number = 16; // 128 bits
  private saltLength: number = 32; // 256 bits
  private tagLength: number = 16; // 128 bits

  constructor(encryptionKey?: string) {
    const keyFromEnv = encryptionKey || process.env.SHARD_ENCRYPTION_KEY;
    
    if (!keyFromEnv) {
      console.error('[EncryptionService] ✗ SHARD_ENCRYPTION_KEY not found!');
      console.error('[EncryptionService]   encryptionKey param:', encryptionKey ? 'provided' : 'not provided');
      console.error('[EncryptionService]   process.env.SHARD_ENCRYPTION_KEY:', process.env.SHARD_ENCRYPTION_KEY ? 'exists' : 'missing');
      throw new Error('SHARD_ENCRYPTION_KEY environment variable is required for shard encryption');
    }

    // Log which key is being used (only in development mode to avoid exposing sensitive info)
    if (process.env.NODE_ENV === 'development') {
      if (encryptionKey) {
        console.log(`[EncryptionService] Using provided encryption key (length: ${encryptionKey.length})`);
      } else {
        console.log(`[EncryptionService] Using SHARD_ENCRYPTION_KEY from env (length: ${keyFromEnv.length})`);
      }
    }

    // Derive a 32-byte (256-bit) key from the provided key using PBKDF2
    // This allows using a password-like string in .env while ensuring a proper key length
    this.encryptionKey = crypto.pbkdf2Sync(
      keyFromEnv,
      'bsv-wallet-shard-salt', // Static salt for key derivation
      100000, // 100k iterations
      32, // 32 bytes = 256 bits
      'sha256'
    );
  }

  /**
   * Encrypt a shard
   * Returns: base64 encoded string containing IV + tag + ciphertext
   */
  encryptShard(plainShard: string): string {
    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher (GCM mode)
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      ) as crypto.CipherGCM;

      // Encrypt
      let encrypted = cipher.update(plainShard, 'utf8');
      const final = cipher.final();
      encrypted = Buffer.concat([encrypted, final]);
      
      // Get authentication tag (GCM mode)
      const tag = cipher.getAuthTag();

      // Combine IV + tag + ciphertext
      const combined = Buffer.concat([iv, tag, encrypted]);
      
      // Return as base64
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Failed to encrypt shard: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a shard
   * Input: base64 encoded string containing IV + tag + ciphertext
   */
  decryptShard(encryptedShard: string): string {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedShard, 'base64');
      
      // Extract IV, tag, and ciphertext
      const iv = combined.slice(0, this.ivLength);
      const tag = combined.slice(this.ivLength, this.ivLength + this.tagLength);
      const ciphertext = combined.slice(this.ivLength + this.tagLength);

      // Create decipher (GCM mode)
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      ) as crypto.DecipherGCM;

      // Set authentication tag (GCM mode)
      decipher.setAuthTag(tag);

      // Decrypt
      let decrypted = decipher.update(ciphertext);
      const final = decipher.final();
      decrypted = Buffer.concat([decrypted, final]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Failed to decrypt shard: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt multiple shards
   */
  encryptShards(shards: string[]): string[] {
    return shards.map(shard => this.encryptShard(shard));
  }

  /**
   * Decrypt multiple shards
   */
  decryptShards(encryptedShards: string[]): string[] {
    return encryptedShards.map(shard => this.decryptShard(shard));
  }

  /**
   * Validate encrypted shard format
   * Checks if string is base64-encoded encrypted data, not hex-encoded plain shard
   */
  validateEncryptedShard(encryptedShard: string): boolean {
    try {
      // First check: if it's valid hex (plain shard from secrets.js), it's NOT encrypted
      if (/^[0-9a-fA-F]+$/.test(encryptedShard)) {
        return false;
      }
      
      // Second check: try to decode as base64
      const combined = Buffer.from(encryptedShard, 'base64');
      // Minimum size: IV (16) + tag (16) + at least 1 byte ciphertext
      return combined.length >= this.ivLength + this.tagLength + 1;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create EncryptionService instance
 * Exported for testing (allows passing encryption key directly)
 */
export function createEncryptionService(encryptionKey?: string): EncryptionService {
  return new EncryptionService(encryptionKey);
}

