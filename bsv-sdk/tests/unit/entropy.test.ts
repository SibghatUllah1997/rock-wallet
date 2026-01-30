import { EntropyGenerator } from '../../src/core/entropy';

describe('EntropyGenerator', () => {
  describe('generateRandomBytes', () => {
    it('should generate random bytes of specified length', () => {
      const bytes = EntropyGenerator.generateRandomBytes(32);
      expect(bytes).toBeInstanceOf(Buffer);
      expect(bytes.length).toBe(32);
    });

    it('should generate different bytes on each call', () => {
      const bytes1 = EntropyGenerator.generateRandomBytes(32);
      const bytes2 = EntropyGenerator.generateRandomBytes(32);
      expect(bytes1).not.toEqual(bytes2);
    });

    it('should throw error for invalid length', () => {
      expect(() => EntropyGenerator.generateRandomBytes(0)).toThrow();
      expect(() => EntropyGenerator.generateRandomBytes(-1)).toThrow();
    });
  });

  describe('generateMnemonicEntropy', () => {
    it('should generate 128-bit entropy for 12-word mnemonic', () => {
      const entropy = EntropyGenerator.generateMnemonicEntropy(128);
      expect(entropy).toBeInstanceOf(Buffer);
      expect(entropy.length).toBe(16); // 128 bits = 16 bytes
    });

    it('should generate 256-bit entropy for 24-word mnemonic', () => {
      const entropy = EntropyGenerator.generateMnemonicEntropy(256);
      expect(entropy).toBeInstanceOf(Buffer);
      expect(entropy.length).toBe(32); // 256 bits = 32 bytes
    });

    it('should throw error for invalid strength', () => {
      expect(() => EntropyGenerator.generateMnemonicEntropy(64)).toThrow();
      expect(() => EntropyGenerator.generateMnemonicEntropy(512)).toThrow();
    });
  });

  describe('generate12WordEntropy', () => {
    it('should generate 128-bit entropy', () => {
      const entropy = EntropyGenerator.generate12WordEntropy();
      expect(entropy).toBeInstanceOf(Buffer);
      expect(entropy.length).toBe(16);
    });
  });

  describe('generate24WordEntropy', () => {
    it('should generate 256-bit entropy', () => {
      const entropy = EntropyGenerator.generate24WordEntropy();
      expect(entropy).toBeInstanceOf(Buffer);
      expect(entropy.length).toBe(32);
    });
  });

  describe('validateEntropy', () => {
    it('should validate correct entropy', () => {
      const entropy = EntropyGenerator.generate12WordEntropy();
      expect(EntropyGenerator.validateEntropy(entropy, 128)).toBe(true);
    });

    it('should reject incorrect entropy length', () => {
      const entropy = EntropyGenerator.generate12WordEntropy();
      expect(EntropyGenerator.validateEntropy(entropy, 256)).toBe(false);
    });

    it('should reject empty entropy', () => {
      const entropy = Buffer.alloc(0);
      expect(EntropyGenerator.validateEntropy(entropy, 128)).toBe(false);
    });
  });
});
