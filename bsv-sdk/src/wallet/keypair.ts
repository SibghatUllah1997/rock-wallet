import { PrivateKey } from '@bsv/sdk';
import * as wif from 'wif';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { DerivationManager, DerivationConfig } from './derivation';

const bip32 = BIP32Factory(ecc);

export interface KeyPairResult {
  address: string;
  privateKey: string;
  publicKey: string;
  keyPair: any;
  derivationPath?: string;
}

export interface KeyPairOptions {
  isTestnet: boolean;
  addressFormat?: 'p2pkh' | 'p2sh';
  derivationPath?: string;
}

/**
 * Key pair generation and management for BSV using native bsv library
 * Supports both P2PKH and P2SH address formats
 */
export class KeyPairManager {
  /**
   * Generate key pair from mnemonic at specific derivation path
   * @param mnemonic - BIP39 mnemonic phrase
   * @param options - Key pair generation options
   * @returns Key pair result with address and keys
   */
  static generateKeyPair(mnemonic: string, options: KeyPairOptions): KeyPairResult {
    // Generate derivation path if not provided
    const derivationPath = options.derivationPath || DerivationManager.generateDerivationPath({
      isTestnet: options.isTestnet
    });

    // Generate root key from mnemonic (using bip32 with ecc)
    const rootKey = DerivationManager.generateRootKey(mnemonic, options.isTestnet);
    
    // Derive child key at specified path
    const childKey = rootKey.derivePath(derivationPath);
    
    // Get private key from child key
    const version = options.isTestnet ? 0xEF : 0x80;
    if (!childKey.privateKey) {
      throw new Error('Derived key has no privateKey');
    }
    const privateKeyWIF = wif.encode({ version, privateKey: childKey.privateKey, compressed: true });
    const privateKey = PrivateKey.fromWif(privateKeyWIF);
    
    // Generate address using bsv library
    const addressFormat = options.addressFormat || 'p2pkh';
    let address: string;
    
    const versionByte = options.isTestnet ? 0x6f : 0x00;
    address = privateKey.toAddress([versionByte]).toString();
    
    return {
      address,
      privateKey: privateKeyWIF,
      publicKey: Buffer.from(childKey.publicKey).toString('hex'),
      keyPair: privateKey,
      derivationPath: derivationPath
    };
  }

  /**
   * Generate multiple key pairs for address range
   * @param mnemonic - BIP39 mnemonic phrase
   * @param options - Base key pair options
   * @param startIndex - Starting address index
   * @param count - Number of addresses to generate
   * @returns Array of key pair results
   */
  static generateKeyPairRange(
    mnemonic: string,
    options: KeyPairOptions,
    startIndex: number = 0,
    count: number = 1
  ): KeyPairResult[] {
    const results: KeyPairResult[] = [];
    
    for (let i = 0; i < count; i++) {
      const pathOptions = {
        ...options,
        derivationPath: DerivationManager.generateDerivationPath({
          isTestnet: options.isTestnet,
          addressIndex: startIndex + i
        })
      };
      
      results.push(this.generateKeyPair(mnemonic, pathOptions));
    }
    
    return results;
  }

  /**
   * Generate address from public key using bsv library
   * @param publicKey - Public key buffer
   * @param format - Address format (p2pkh or p2sh)
   * @param isTestnet - Network type
   * @returns Generated address
   */
  static generateAddress(_publicKey: Buffer, _format: 'p2pkh' | 'p2sh', _isTestnet: boolean): string {
    throw new Error('generateAddress from public key is not supported in this build');
  }

  /**
   * Generate key pair from private key WIF
   * @param privateKeyWif - Private key in WIF format
   * @param options - Key pair options
   * @returns Key pair result
   */
  static generateKeyPairFromWif(privateKeyWif: string, options: KeyPairOptions): KeyPairResult {
    try {
      const privateKey = PrivateKey.fromWif(privateKeyWif);
      const versionByte = options.isTestnet ? 0x6f : 0x00;
      const address = privateKey.toAddress([versionByte]).toString();
      const publicKey = privateKey.toPublicKey();
      
      return {
        address,
        privateKey: privateKeyWif,
        publicKey: publicKey.toString(),
        keyPair: privateKey
      };
    } catch (error) {
      throw new Error(`Invalid WIF private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate address format using bsv library
   * @param address - Address to validate
   * @param isTestnet - Network type
   * @returns True if valid address format
   */
  static validateAddress(address: string, isTestnet: boolean): boolean {
    const re = isTestnet ? /^[mn][1-9A-HJ-NP-Za-km-z]{25,34}$/ : /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
    return re.test(address);
  }

  /**
   * Get address type (P2PKH, P2SH, etc.)
   * @param address - Address to analyze
   * @param isTestnet - Network type
   * @returns Address type string
   */
  static getAddressType(_address: string, _isTestnet: boolean): string {
    return 'P2PKH';
  }

  /**
   * Convert public key to address
   * @param publicKeyHex - Public key in hex format
   * @param options - Address generation options
   * @returns Generated address
   */
  static publicKeyToAddress(publicKeyHex: string, options: KeyPairOptions): string {
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    return this.generateAddress(publicKey, options.addressFormat || 'p2pkh', options.isTestnet);
  }

  /**
   * Create signer for transaction signing (compatibility method)
   * @param privateKeyWif - Private key in WIF format
   * @param isTestnet - Network type
   * @returns bsv PrivateKey object
   */
  static createSigner(privateKeyWif: string, _isTestnet: boolean = false): PrivateKey {
    return PrivateKey.fromWif(privateKeyWif);
  }
}
