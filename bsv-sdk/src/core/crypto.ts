import * as crypto from 'crypto';

/**
 * Simple cryptographic utilities for BSV SDK
 * Only provides basic hashing functions - no encryption or passwords needed
 */
export class CryptoUtils {

  /**
   * Hash data using SHA-256
   * @param data - Data to hash
   * @returns SHA-256 hash as hex string
   */
  static sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash data using SHA-512
   * @param data - Data to hash
   * @returns SHA-512 hash as hex string
   */
  static sha512(data: string): string {
    return crypto.createHash('sha512').update(data).digest('hex');
  }

  /**
   * Generate random bytes
   * @param length - Number of bytes to generate
   * @returns Random bytes buffer
   */
  static randomBytes(length: number): Buffer {
    if (length <= 0) {
      throw new Error('Length must be positive');
    }
    return crypto.randomBytes(length);
  }
}
