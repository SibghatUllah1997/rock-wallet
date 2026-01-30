import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { DerivationManager } from './derivation';

const bip32 = BIP32Factory(ecc);

export interface ExtendedPublicKey {
  xpub: string;
  network: string;
  derivationPath: string;
  publicKey: string;
  chainCode: string;
}

export interface XPubDerivationResult {
  address: string;
  publicKey: string;
  derivationPath: string;
}

/**
 * Extended Public Key (xPub) management for BSV
 * Supports xPub generation and address derivation
 */
export class XPubManager {
  /**
   * Generate root-level xPub from mnemonic (master key at root "m")
   * This is used for MPC wallet creation per requirements
   * @param mnemonic - BIP39 mnemonic phrase
   * @param isTestnet - Network type
   * @returns Extended public key information at root level
   */
  static generateRootXPub(
    mnemonic: string,
    isTestnet: boolean
  ): ExtendedPublicKey {
    // Generate root key from mnemonic
    const rootKey = DerivationManager.generateRootKey(mnemonic, isTestnet);
    
    // Generate root-level xPub (master key at root "m")
    // This is the master extended public key
    const xpub = rootKey.neutered().toBase58();
    
    return {
      xpub,
      network: isTestnet ? 'testnet' : 'mainnet',
      derivationPath: 'm',
      publicKey: Buffer.from(rootKey.publicKey).toString('hex'),
      chainCode: Buffer.from(rootKey.chainCode).toString('hex')
    };
  }

  /**
   * Generate xPub from mnemonic at account level
   * @param mnemonic - BIP39 mnemonic phrase
   * @param isTestnet - Network type
   * @param accountIndex - Account index (default: 0)
   * @returns Extended public key information
   */
  static generateXPub(
    mnemonic: string,
    isTestnet: boolean,
    accountIndex: number = 0
  ): ExtendedPublicKey {
    // Generate root key from mnemonic
    const rootKey = DerivationManager.generateRootKey(mnemonic, isTestnet);
    
    // Generate account-level derivation path: m/44'/coinType'/account'
    const coinType = DerivationManager.getCoinType(isTestnet);
    const accountPath = `m/44'/${coinType}'/${accountIndex}'`;
    
    // Derive account-level key
    const accountKey = rootKey.derivePath(accountPath);
    
    // Generate xPub
    const xpub = accountKey.neutered().toBase58();
    
    return {
      xpub,
      network: isTestnet ? 'testnet' : 'mainnet',
      derivationPath: accountPath,
      publicKey: Buffer.from(accountKey.publicKey).toString('hex'),
      chainCode: Buffer.from(accountKey.chainCode).toString('hex')
    };
  }

  /**
   * Generate xPub from mnemonic with specific coin type
   * @param mnemonic - BIP39 mnemonic phrase
   * @param coinType - Coin type (0 for Bitcoin, 236 for BSV mainnet, 1 for testnet, etc.)
   * @param accountIndex - Account index (default: 0)
   * @returns Extended public key information
   */
  static generateXPubWithCoinType(
    mnemonic: string,
    coinType: number,
    accountIndex: number = 0
  ): ExtendedPublicKey {
    // Determine network based on coin type
    // Bitcoin mainnet = 0, Bitcoin testnet = 1, BSV mainnet = 236, BSV testnet = 1
    // For coin type 0 (Bitcoin mainnet), use mainnet network
    // For coin type 1, it could be testnet (Bitcoin or BSV)
    // For coin type 236 (BSV mainnet), use mainnet network
    // Default: if coinType is 0 or 236, use mainnet; otherwise use testnet
    const isTestnet = coinType !== 0 && coinType !== 236;
    
    // Generate root key from mnemonic
    const rootKey = DerivationManager.generateRootKey(mnemonic, isTestnet);
    
    // Generate account-level derivation path: m/44'/coinType'/account'
    const accountPath = `m/44'/${coinType}'/${accountIndex}'`;
    
    // Derive account-level key
    const accountKey = rootKey.derivePath(accountPath);
    
    // Generate xPub
    const xpub = accountKey.neutered().toBase58();
    
    return {
      xpub,
      network: isTestnet ? 'testnet' : 'mainnet',
      derivationPath: accountPath,
      publicKey: Buffer.from(accountKey.publicKey).toString('hex'),
      chainCode: Buffer.from(accountKey.chainCode).toString('hex')
    };
  }

  /**
   * Derive address from xPub at specific index
   * @param xpub - Extended public key
   * @param addressIndex - Address index
   * @param changeIndex - Change index (default: 0)
   * @param addressFormat - Address format (default: 'p2pkh')
   * @returns Derived address information
   */
  static deriveAddressFromXPub(
    xpub: string,
    addressIndex: number,
    changeIndex: number = 0,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): XPubDerivationResult {
    try {
      // Parse xPub with network
      const xpubNetwork = this.getNetworkFromXPub(xpub);
      const xpubKey = bip32.fromBase58(xpub, xpubNetwork);
      
      // Derive change-level key: /change
      const changeKey = xpubKey.derive(changeIndex);
      
      // Derive address-level key: /address
      const addressKey = changeKey.derive(addressIndex);
      
      // Generate address
      const network = this.getNetworkFromXPub(xpub);
      const address = this.generateAddressFromPublicKey(
        Buffer.from(addressKey.publicKey),
        addressFormat,
        network
      );
      
      const derivationPath = `${changeIndex}/${addressIndex}`;
      
      return {
        address,
        publicKey: Buffer.from(addressKey.publicKey).toString('hex'),
        derivationPath
      };
    } catch (error) {
      throw new Error(`Failed to derive address from xPub: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Derive multiple addresses from xPub
   * @param xpub - Extended public key
   * @param startIndex - Starting address index
   * @param count - Number of addresses to derive
   * @param changeIndex - Change index (default: 0)
   * @param addressFormat - Address format (default: 'p2pkh')
   * @returns Array of derived address information
   */
  static deriveAddressRangeFromXPub(
    xpub: string,
    startIndex: number,
    count: number,
    changeIndex: number = 0,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): XPubDerivationResult[] {
    const results: XPubDerivationResult[] = [];
    
    for (let i = 0; i < count; i++) {
      const addressIndex = startIndex + i;
      results.push(this.deriveAddressFromXPub(xpub, addressIndex, changeIndex, addressFormat));
    }
    
    return results;
  }

  /**
   * Generate address from public key
   * @param publicKey - Public key buffer
   * @param addressFormat - Address format
   * @param network - Bitcoin network
   * @returns Generated address
   */
  private static generateAddressFromPublicKey(
    publicKey: Buffer,
    addressFormat: 'p2pkh' | 'p2sh',
    network: bitcoin.Network
  ): string {
    let payment: bitcoin.Payment;

    switch (addressFormat) {
      case 'p2pkh':
        payment = bitcoin.payments.p2pkh({
          pubkey: publicKey,
          network: network
        });
        break;
      case 'p2sh':
        payment = bitcoin.payments.p2sh({
          redeem: bitcoin.payments.p2pkh({
            pubkey: publicKey,
            network: network
          }),
          network: network
        });
        break;
      default:
        throw new Error(`Unsupported address format: ${addressFormat}`);
    }

    if (!payment.address) {
      throw new Error('Failed to generate address from public key');
    }

    return payment.address;
  }

  /**
   * Get network from xPub format
   * @param xpub - Extended public key
   * @returns Bitcoin network
   */
  private static getNetworkFromXPub(xpub: string): bitcoin.Network {
    // BSV mainnet xPub starts with 'xpub'
    // BSV testnet xPub starts with 'tpub'
    if (xpub.startsWith('xpub')) {
      return bitcoin.networks.bitcoin;
    } else if (xpub.startsWith('tpub')) {
      return bitcoin.networks.testnet;
    } else {
      throw new Error('Unsupported xPub format');
    }
  }

  /**
   * Validate xPub format
   * @param xpub - Extended public key to validate
   * @returns True if valid xPub format
   */
  static validateXPub(xpub: string): boolean {
    try {
      bip32.fromBase58(xpub);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get xPub information
   * @param xpub - Extended public key
   * @returns xPub information
   */
  static getXPubInfo(xpub: string): {
    network: string;
    depth: number;
    parentFingerprint: string;
    childNumber: number;
    chainCode: string;
    publicKey: string;
  } {
    try {
      const xpubKey = bip32.fromBase58(xpub);
      const network = this.getNetworkFromXPub(xpub);
      
      return {
        network: network === bitcoin.networks.bitcoin ? 'mainnet' : 'testnet',
        depth: xpubKey.depth,
        parentFingerprint: xpubKey.parentFingerprint.toString(16),
        childNumber: xpubKey.index,
        chainCode: Buffer.from(xpubKey.chainCode).toString('hex'),
        publicKey: Buffer.from(xpubKey.publicKey).toString('hex')
      };
    } catch (error) {
      throw new Error(`Invalid xPub: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create xPub from existing key
   * @param key - BIP32 key
   * @returns xPub string
   */
  static createXPubFromKey(key: any): string {
    return key.neutered().toBase58();
  }

  /**
   * Generate xPub for multiple accounts
   * @param mnemonic - BIP39 mnemonic phrase
   * @param isTestnet - Network type
   * @param accountCount - Number of accounts to generate
   * @returns Array of xPub information
   */
  static generateMultipleXPub(
    mnemonic: string,
    isTestnet: boolean,
    accountCount: number = 1
  ): ExtendedPublicKey[] {
    const results: ExtendedPublicKey[] = [];
    
    for (let i = 0; i < accountCount; i++) {
      results.push(this.generateXPub(mnemonic, isTestnet, i));
    }
    
    return results;
  }
}
