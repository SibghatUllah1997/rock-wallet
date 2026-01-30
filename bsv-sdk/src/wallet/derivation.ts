import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';

const bip32 = BIP32Factory(ecc);

export interface DerivationConfig {
  isTestnet: boolean;
  accountIndex?: number;
  changeIndex?: number;
  addressIndex?: number;
  maxAddresses?: number;
}

export interface DerivationPath {
  path: string;
  purpose: number;
  coinType: number;
  account: number;
  change: number;
  address: number;
}

/**
 * BIP44 derivation path management for BSV
 * Supports dynamic index management for backend integration
 */
export class DerivationManager {
  private static readonly BSV_MAINNET_COIN_TYPE = 236; // BSV coin type
  private static readonly BSV_TESTNET_COIN_TYPE = 1;   // Testnet coin type
  private static readonly DEFAULT_MAX_ADDRESSES = 100000; // 0-99999

  /**
   * Generate BIP44 derivation path for BSV
   * @param config - Derivation configuration
   * @returns Derivation path string
   */
  static generateDerivationPath(config: DerivationConfig): string {
    const coinType = config.isTestnet ? this.BSV_TESTNET_COIN_TYPE : this.BSV_MAINNET_COIN_TYPE;
    const account = config.accountIndex ?? 0;
    const change = config.changeIndex ?? 0;
    const address = config.addressIndex ?? 0;

    return `m/44'/${coinType}'/${account}'/${change}/${address}`;
  }

  /**
   * Parse derivation path into components
   * @param path - BIP44 derivation path
   * @returns Parsed derivation components
   */
  static parseDerivationPath(path: string): DerivationPath {
    const parts = path.split('/');
    
    if (parts.length !== 6 || parts[0] !== 'm') {
      throw new Error('Invalid BIP44 derivation path format');
    }

    const purpose = parseInt(parts[1].replace("'", ''));
    const coinType = parseInt(parts[2].replace("'", ''));
    const account = parseInt(parts[3].replace("'", ''));
    const change = parseInt(parts[4]);
    const address = parseInt(parts[5]);

    return {
      path,
      purpose,
      coinType,
      account,
      change,
      address
    };
  }

  /**
   * Generate multiple derivation paths for address range
   * @param config - Base derivation configuration
   * @param startIndex - Starting address index
   * @param count - Number of addresses to generate
   * @returns Array of derivation paths
   */
  static generateAddressRange(
    config: DerivationConfig,
    startIndex: number = 0,
    count: number = 1
  ): string[] {
    if (startIndex < 0) {
      throw new Error('Start index must be non-negative');
    }
    if (count <= 0) {
      throw new Error('Count must be positive');
    }

    const maxAddresses = config.maxAddresses ?? this.DEFAULT_MAX_ADDRESSES;
    if (startIndex + count > maxAddresses) {
      throw new Error(`Address range exceeds maximum (${maxAddresses})`);
    }

    const paths: string[] = [];
    for (let i = 0; i < count; i++) {
      const pathConfig = {
        ...config,
        addressIndex: startIndex + i
      };
      paths.push(this.generateDerivationPath(pathConfig));
    }

    return paths;
  }

  /**
   * Generate all derivation paths for a given range
   * @param config - Base derivation configuration
   * @param range - Address range object
   * @returns Array of derivation paths
   */
  static generateDerivationRange(
    config: DerivationConfig,
    range: { start: number; end: number }
  ): string[] {
    if (range.start < 0 || range.end < 0) {
      throw new Error('Range indices must be non-negative');
    }
    if (range.start > range.end) {
      throw new Error('Start index must be less than or equal to end index');
    }

    const count = range.end - range.start + 1;
    return this.generateAddressRange(config, range.start, count);
  }

  /**
   * Validate derivation path format
   * @param path - Derivation path to validate
   * @returns True if valid BIP44 path
   */
  static validateDerivationPath(path: string): boolean {
    try {
      const parsed = this.parseDerivationPath(path);
      
      // Check BIP44 compliance
      if (parsed.purpose !== 44) {
        return false;
      }

      // Check BSV coin types
      const validCoinTypes = [this.BSV_MAINNET_COIN_TYPE, this.BSV_TESTNET_COIN_TYPE];
      if (!validCoinTypes.includes(parsed.coinType)) {
        return false;
      }

      // Check non-negative indices
      return parsed.account >= 0 && parsed.change >= 0 && parsed.address >= 0;
    } catch {
      return false;
    }
  }

  /**
   * Get coin type for network
   * @param isTestnet - Whether using testnet
   * @returns Coin type number
   */
  static getCoinType(isTestnet: boolean): number {
    return isTestnet ? this.BSV_TESTNET_COIN_TYPE : this.BSV_MAINNET_COIN_TYPE;
  }

  /**
   * Create derivation config from mnemonic and network
   * @param mnemonic - BIP39 mnemonic
   * @param isTestnet - Network type
   * @param maxAddresses - Maximum addresses to support
   * @returns Derivation configuration
   */
  static createConfig(
    mnemonic: string,
    isTestnet: boolean,
    maxAddresses: number = this.DEFAULT_MAX_ADDRESSES
  ): DerivationConfig {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    return {
      isTestnet,
      accountIndex: 0,
      changeIndex: 0,
      addressIndex: 0,
      maxAddresses
    };
  }

  /**
   * Generate root key from mnemonic
   * @param mnemonic - BIP39 mnemonic
   * @param isTestnet - Network type
   * @returns BIP32 root key
   */
  static generateRootKey(mnemonic: string, isTestnet: boolean) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    
    return bip32.fromSeed(seed, network);
  }

  /**
   * Generate account key from root key
   * @param rootKey - BIP32 root key
   * @param accountIndex - Account index
   * @param isTestnet - Network type
   * @returns BIP32 account key
   */
  static generateAccountKey(rootKey: any, accountIndex: number, isTestnet: boolean) {
    const coinType = this.getCoinType(isTestnet);
    const accountPath = `m/44'/${coinType}'/${accountIndex}'`;
    return rootKey.derivePath(accountPath);
  }

  /**
   * Generate address key from account key
   * @param accountKey - BIP32 account key
   * @param changeIndex - Change index (0 for external, 1 for change)
   * @param addressIndex - Address index
   * @returns BIP32 address key
   */
  static generateAddressKey(accountKey: any, changeIndex: number, addressIndex: number) {
    const addressPath = `${changeIndex}/${addressIndex}`;
    return accountKey.derivePath(addressPath);
  }

  /**
   * Generate Bitcoin SV address from public key
   * @param publicKey - Public key buffer
   * @param isTestnet - Network type
   * @param addressFormat - Address format ('p2pkh' or 'p2sh')
   * @returns Bitcoin SV address
   */
  static generateAddress(publicKey: Buffer, isTestnet: boolean, addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'): string {
    const network = isTestnet ? { 
      pubKeyHash: 0x6f,
      scriptHash: 0xc4
    } : {
      pubKeyHash: 0x00,
      scriptHash: 0x05
    };
    
    if (addressFormat === 'p2pkh') {
      const hash160 = require('crypto').createHash('ripemd160')
        .update(require('crypto').createHash('sha256').update(publicKey).digest())
        .digest();
      
      const version = Buffer.from([network.pubKeyHash]);
      const payload = Buffer.concat([version, hash160]);
      const checksum = require('crypto').createHash('sha256').update(
        require('crypto').createHash('sha256').update(payload).digest()
      ).digest().slice(0, 4);
      
      const address = Buffer.concat([payload, checksum]);
      return this.base58Encode(address);
    } else {
      // P2SH implementation would go here
      throw new Error('P2SH address generation not implemented yet');
    }
  }

  /**
   * Base58 encode buffer
   * @param buffer - Buffer to encode
   * @returns Base58 encoded string
   */
  private static base58Encode(buffer: Buffer): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(alphabet.length);
    
    let num = BigInt(0);
    for (let i = 0; i < buffer.length; i++) {
      num = num * BigInt(256) + BigInt(buffer[i]);
    }
    
    let result = '';
    while (num > 0) {
      result = alphabet[Number(num % base)] + result;
      num = num / base;
    }
    
    // Handle leading zeros
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
      result = '1' + result;
    }
    
    return result;
  }
}
