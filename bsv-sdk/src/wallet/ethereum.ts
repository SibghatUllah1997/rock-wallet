import { ethers } from 'ethers';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';

const bip32 = BIP32Factory(ecc);

export interface EthereumKeyPairResult {
  address: string;
  privateKey: string;
  publicKey: string;
  derivationPath: string;
}

export interface EthereumXPubResult {
  xpub: string;
  derivationPath: string;
  publicKey: string;
  chainCode: string;
}

/**
 * Ethereum/EVM wallet key pair generation and management
 * Supports BIP44 derivation for Ethereum (coin type 60)
 */
export class EthereumKeyPairManager {
  /**
   * Derive Ethereum address from mnemonic and HD path
   * Ethereum uses BIP44 path: m/44'/60'/account'/change/address_index
   * 
   * @param mnemonic - BIP39 mnemonic phrase
   * @param accountPath - Full account path (e.g., m/44'/60'/0')
   * @param addressPath - Address path after account (e.g., 0/0)
   * @returns Ethereum key pair result
   */
  static deriveEthereumAddress(
    mnemonic: string,
    accountPath: string,
    addressPath: string
  ): EthereumKeyPairResult {
    try {
      // Parse account path to extract account index
      // Format: m/44'/60'/account_index'
      const accountPathMatch = /^m\/44'\/60'\/(\d+)'$/.exec(accountPath.trim());
      if (!accountPathMatch) {
        throw new Error(`Invalid Ethereum account path format: ${accountPath}. Expected format: m/44'/60'/account_index'`);
      }

      const accountIndex = parseInt(accountPathMatch[1], 10);

      // Parse address path
      // Format: change/index (e.g., 0/0)
      const addressPathMatch = /^(\d+)\/(\d+)$/.exec(addressPath.trim());
      if (!addressPathMatch) {
        throw new Error(`Invalid address path format: ${addressPath}. Expected format: change/index (e.g., 0/0)`);
      }

      const changeIndex = parseInt(addressPathMatch[1], 10);
      const addressIndex = parseInt(addressPathMatch[2], 10);

      // Full derivation path: m/44'/60'/account'/change/index
      const fullPath = `m/44'/60'/${accountIndex}'/${changeIndex}/${addressIndex}`;
      
      // Relative path for derivation (without "m/" prefix)
      // ethers.js HDNodeWallet.fromPhrase() creates a wallet at m/44'/60'/0'/0/0 (depth 5),
      // so we need to create a root node first, then derive from there
      const relativePath = `44'/60'/${accountIndex}'/${changeIndex}/${addressIndex}`;

      // Create root node from mnemonic
      // In ethers.js v6, HDNodeWallet.fromPhrase() creates at m/44'/60'/0'/0/0 by default (depth 5)
      // We need to create a root node (depth 0, path "m") to derive arbitrary BIP44 paths
      // Solution: Use Mnemonic.fromPhrase() to get mnemonic object, then create root from seed
      const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
      const seed = mnemonicObj.computeSeed();
      
      // Create root HDNodeWallet from seed
      // HDNodeWallet.fromSeed() creates a root node (path "m", depth 0)
      const rootWallet = ethers.HDNodeWallet.fromSeed(seed);

      // Derive wallet at the relative path from root (not starting with "m/")
      const derivedWallet = rootWallet.derivePath(relativePath);

      return {
        address: derivedWallet.address,
        privateKey: derivedWallet.privateKey,
        publicKey: derivedWallet.publicKey,
        derivationPath: fullPath
      };
    } catch (error) {
      throw new Error(`Failed to derive Ethereum address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate Ethereum address format
   * 
   * @param address - Ethereum address to validate
   * @returns True if address is valid
   */
  static isValidEthereumAddress(address: string): boolean {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  /**
   * Generate Ethereum xpub (extended public key) at account level
   * Uses BIP32/BIP44 to generate a proper xpub that can derive multiple addresses
   * 
   * @param mnemonic - BIP39 mnemonic phrase
   * @param accountPath - Account path (e.g., m/44'/60'/0')
   * @returns Ethereum xpub result with Base58-encoded xpub
   */
  static generateEthereumXPub(
    mnemonic: string,
    accountPath: string
  ): EthereumXPubResult {
    try {
      // Parse account path to extract account index
      // Format: m/44'/60'/account_index'
      const accountPathMatch = /^m\/44'\/60'\/(\d+)'$/.exec(accountPath.trim());
      if (!accountPathMatch) {
        throw new Error(`Invalid Ethereum account path format: ${accountPath}. Expected format: m/44'/60'/account_index'`);
      }

      const accountIndex = parseInt(accountPathMatch[1], 10);

      // Validate mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
      }

      // Generate seed from mnemonic
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      
      // Create root BIP32 node from seed
      // Use Bitcoin mainnet network for xpub encoding (Ethereum xpub uses same format)
      const rootNode = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
      
      // Derive account-level key at m/44'/60'/account_index'
      const accountKey = rootNode.derivePath(`m/44'/60'/${accountIndex}'`);
      
      // Generate xpub (neutered/extended public key) in Base58 format
      const xpub = accountKey.neutered().toBase58();
      
      return {
        xpub,
        derivationPath: accountPath,
        publicKey: Buffer.from(accountKey.publicKey).toString('hex'),
        chainCode: Buffer.from(accountKey.chainCode).toString('hex')
      };
    } catch (error) {
      throw new Error(`Failed to generate Ethereum xpub: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get chain name for common networks (helper function for display/logging only)
   * This is optional and doesn't affect transaction signing - any chain_id works
   * 
   * @param chainId - Chain ID number
   * @returns Network name or chain ID as string
   */
  static getChainName(chainId: number): string {
    const chains: { [key: number]: string } = {
      1: 'Ethereum Mainnet',
      3: 'Ropsten',
      4: 'Rinkeby',
      5: 'Goerli',
      11155111: 'Sepolia',
      56: 'BSC Mainnet',
      97: 'BSC Testnet',
      137: 'Polygon Mainnet',
      80001: 'Polygon Mumbai',
      42161: 'Arbitrum One',
      42170: 'Arbitrum Nova',
      10: 'Optimism',
      8453: 'Base Mainnet',
      84531: 'Base Goerli'
    };
    return chains[chainId] || `Chain ID ${chainId}`;
  }
}

