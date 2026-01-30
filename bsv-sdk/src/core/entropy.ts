import * as crypto from 'crypto';

/**
 * Universal entropy generation for BSV SDK
 * Provides cryptographically secure random entropy
 */
export class EntropyGenerator {
  /**
   * Generate cryptographically secure random bytes
   * @param length - Number of bytes to generate (default: 32)
   * @returns Random bytes as Buffer
   */
  static generateRandomBytes(length: number = 32): Buffer {
    if (length <= 0) {
      throw new Error('Length must be positive');
    }
    return crypto.randomBytes(length);
  }

  /**
   * Generate entropy for mnemonic generation
   * @param strength - Entropy strength in bits (128, 160, 192, 224, 256)
   * @returns Entropy buffer
   */
  static generateMnemonicEntropy(strength: 128 | 160 | 192 | 224 | 256 = 128): Buffer {
    const validStrengths = [128, 160, 192, 224, 256];
    if (!validStrengths.includes(strength)) {
      throw new Error(`Invalid entropy strength. Must be one of: ${validStrengths.join(', ')}`);
    }

    const entropyBytes = strength / 8;
    return this.generateRandomBytes(entropyBytes);
  }

  /**
   * Generate 128-bit entropy for 12-word mnemonic (default)
   * @returns 128-bit entropy buffer
   */
  static generate12WordEntropy(): Buffer {
    return this.generateMnemonicEntropy(128);
  }

  /**
   * Generate 256-bit entropy for 24-word mnemonic
   * @returns 256-bit entropy buffer
   */
  static generate24WordEntropy(): Buffer {
    return this.generateMnemonicEntropy(256);
  }

  /**
   * Validate entropy buffer
   * @param entropy - Entropy buffer to validate
   * @param expectedStrength - Expected strength in bits
   * @returns True if valid
   */
  static validateEntropy(entropy: Buffer, expectedStrength: number): boolean {
    const expectedBytes = expectedStrength / 8;
    return entropy.length === expectedBytes && entropy.length > 0;
  }
}
