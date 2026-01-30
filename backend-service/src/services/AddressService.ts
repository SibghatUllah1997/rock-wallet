import * as crypto from 'crypto';
import Address from '../models/Address';
import Wallet from '../models/Wallet';
import { BSVService } from './BSVService';

export interface AddressGenerationResult {
  address: string;
  addressIndex: number;
  derivationPath: string;
  publicKey?: string;
  isUsed: boolean;
  createdAt: Date;
}

export interface BatchAddressResult {
  addresses: AddressGenerationResult[];
  startIndex: number;
  count: number;
  walletId: string;
}

export interface AddressSyncResult {
  totalAddresses: number;
  newAddresses: number;
  updatedAddresses: number;
  errors: string[];
}

/**
 * Address Management Service
 * Handles on-demand address generation and tracking
 */
export class AddressService {
  private isTestnet: boolean;
  private bsvService: BSVService;

  constructor(isTestnet: boolean = false) {
    this.isTestnet = isTestnet;
    this.bsvService = new BSVService(isTestnet);
  }

  /**
   * Generate a single address for a wallet
   * @param walletId - Wallet ID
   * @param addressIndex - Specific address index (optional)
   * @returns Generated address information
   */
  async generateAddress(walletId: string, addressIndex?: number): Promise<AddressGenerationResult> {
    try {
      // Get wallet information
      const wallet = await Wallet.findOne({ walletId, isActive: true });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Validate wallet type - legacy APIs cannot use MPC wallets
      if (wallet.walletType === 'mpc') {
        throw new Error('MPC wallets cannot use legacy address generation. Use MPC APIs (/rwcore/api/v1/mpc/wallets/{wallet_id}/accounts/xpub) instead.');
      }

      // Determine next available index if not specified
      let nextIndex = addressIndex;
      if (nextIndex === undefined) {
        const lastAddress = await Address.findOne({ walletId, isActive: true })
          .sort({ addressIndex: -1 });
        nextIndex = lastAddress ? lastAddress.addressIndex + 1 : 0;
      }

      // Check if address already exists
      const existingAddress = await Address.findOne({ 
        walletId, 
        addressIndex: nextIndex, 
        isActive: true 
      });

      if (existingAddress) {
        return {
          address: existingAddress.address,
          addressIndex: existingAddress.addressIndex,
          derivationPath: existingAddress.derivationPath,
          isUsed: existingAddress.isUsed,
          createdAt: existingAddress.createdAt
        };
      }

      // Generate address and public key using BSVService
      const addressData = this.bsvService.deriveAddressFromXPub(wallet.xpub, nextIndex, 0);
      const derivationPath = addressData.derivationPath; // BIP44 path from SDK

      // Save address to database
      const newAddress = new Address({
        addressId: crypto.randomUUID(),
        walletId,
        accountId: 'default_account', // This will be updated when accounts are created
        address: addressData.address,
        addressIndex: nextIndex,
        derivationPath: addressData.derivationPath,
        currencyCode: 'BSV',
        isUsed: false,
        isActive: true
      });

      await newAddress.save();

      return {
        address: newAddress.address,
        addressIndex: newAddress.addressIndex,
        derivationPath: newAddress.derivationPath,
        publicKey: addressData.publicKey,
        isUsed: newAddress.isUsed,
        createdAt: newAddress.createdAt
      };

    } catch (error) {
      throw new Error(`Failed to generate address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate multiple addresses for a wallet
   * @param walletId - Wallet ID
   * @param count - Number of addresses to generate
   * @param startIndex - Starting index (optional)
   * @returns Batch address generation result
   */
  async generateBatchAddresses(
    walletId: string, 
    count: number, 
    startIndex?: number
  ): Promise<BatchAddressResult> {
    try {
      // Get wallet information
      const wallet = await Wallet.findOne({ walletId, isActive: true });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Validate wallet type - legacy APIs cannot use MPC wallets
      if (wallet.walletType === 'mpc') {
        throw new Error('MPC wallets cannot use legacy address generation. Use MPC APIs (/rwcore/api/v1/mpc/wallets/{wallet_id}/accounts/xpub) instead.');
      }

      // Determine starting index
      let startIdx = startIndex;
      if (startIdx === undefined) {
        const lastAddress = await Address.findOne({ walletId, isActive: true })
          .sort({ addressIndex: -1 });
        startIdx = lastAddress ? lastAddress.addressIndex + 1 : 0;
      }

      const addresses: AddressGenerationResult[] = [];

      // Generate addresses in batch
      for (let i = 0; i < count; i++) {
        const addressIndex = startIdx + i;
        
        // Check if address already exists
        const existingAddress = await Address.findOne({ 
          walletId, 
          addressIndex, 
          isActive: true 
        });

        if (existingAddress) {
          addresses.push({
            address: existingAddress.address,
            addressIndex: existingAddress.addressIndex,
            derivationPath: existingAddress.derivationPath,
            isUsed: existingAddress.isUsed,
            createdAt: existingAddress.createdAt
          });
          continue;
        }

        // Generate new address using BSVService
        const addressData = this.bsvService.deriveAddressFromXPub(wallet.xpub, addressIndex, 0);
        const address = addressData.address;
        const derivationPath = addressData.derivationPath;

        // Save to database
        const newAddress = new Address({
          addressId: crypto.randomUUID(),
          walletId,
          address,
          addressIndex,
          derivationPath,
          isUsed: false,
          isActive: true
        });

        await newAddress.save();

        addresses.push({
          address: address,
          addressIndex: addressIndex,
          derivationPath: derivationPath,
          publicKey: addressData.publicKey,
          isUsed: newAddress.isUsed,
          createdAt: newAddress.createdAt
        });
      }

      return {
        addresses,
        startIndex: startIdx,
        count,
        walletId
      };

    } catch (error) {
      throw new Error(`Failed to generate batch addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get addresses for a wallet
   * @param walletId - Wallet ID
   * @param limit - Maximum number of addresses to return
   * @param offset - Number of addresses to skip
   * @returns Array of addresses
   */
  async getAddresses(walletId: string, limit: number = 50, offset: number = 0): Promise<AddressGenerationResult[]> {
    try {
      const addresses = await Address.find({ walletId, isActive: true })
        .sort({ addressIndex: 1 })
        .limit(limit)
        .skip(offset);

      return addresses.map(addr => ({
        address: addr.address,
        addressIndex: addr.addressIndex,
        derivationPath: addr.derivationPath,
        isUsed: addr.isUsed,
        createdAt: addr.createdAt
      }));

    } catch (error) {
      throw new Error(`Failed to get addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get address by index
   * @param walletId - Wallet ID
   * @param addressIndex - Address index
   * @returns Address information
   */
  async getAddressByIndex(walletId: string, addressIndex: number): Promise<AddressGenerationResult | null> {
    try {
      const address = await Address.findOne({ 
        walletId, 
        addressIndex, 
        isActive: true 
      });

      if (!address) {
        return null;
      }

      return {
        address: address.address,
        addressIndex: address.addressIndex,
        derivationPath: address.derivationPath,
        isUsed: address.isUsed,
        createdAt: address.createdAt
      };

    } catch (error) {
      throw new Error(`Failed to get address by index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark address as used
   * @param walletId - Wallet ID
   * @param addressIndex - Address index
   * @returns Success status
   */
  async markAddressAsUsed(walletId: string, addressIndex: number): Promise<boolean> {
    try {
      const result = await Address.updateOne(
        { walletId, addressIndex, isActive: true },
        { isUsed: true, updatedAt: new Date() }
      );

      return result.modifiedCount > 0;

    } catch (error) {
      throw new Error(`Failed to mark address as used: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get next unused address
   * @param walletId - Wallet ID
   * @returns Next unused address
   */
  async getNextUnusedAddress(walletId: string): Promise<AddressGenerationResult | null> {
    try {
      const address = await Address.findOne({ 
        walletId, 
        isUsed: false, 
        isActive: true 
      }).sort({ addressIndex: 1 });

      if (!address) {
        return null;
      }

      return {
        address: address.address,
        addressIndex: address.addressIndex,
        derivationPath: address.derivationPath,
        isUsed: address.isUsed,
        createdAt: address.createdAt
      };

    } catch (error) {
      throw new Error(`Failed to get next unused address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get address statistics
   * @param walletId - Wallet ID
   * @returns Address statistics
   */
  async getAddressStatistics(walletId: string): Promise<{
    totalAddresses: number;
    usedAddresses: number;
    unusedAddresses: number;
    lastGeneratedIndex: number;
  }> {
    try {
      const totalAddresses = await Address.countDocuments({ walletId, isActive: true });
      const usedAddresses = await Address.countDocuments({ walletId, isUsed: true, isActive: true });
      const unusedAddresses = totalAddresses - usedAddresses;

      const lastAddress = await Address.findOne({ walletId, isActive: true })
        .sort({ addressIndex: -1 });

      return {
        totalAddresses,
        usedAddresses,
        unusedAddresses,
        lastGeneratedIndex: lastAddress ? lastAddress.addressIndex : -1
      };

    } catch (error) {
      throw new Error(`Failed to get address statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate address format
   * @param address - Address to validate
   * @returns Validation result
   */
  validateAddress(address: string): { isValid: boolean; error?: string } {
    try {
      // Basic address validation (can be enhanced)
      if (!address || typeof address !== 'string') {
        return { isValid: false, error: 'Address must be a non-empty string' };
      }

      if (address.length < 26 || address.length > 35) {
        return { isValid: false, error: 'Invalid address length' };
      }

      // Check for valid Base58 characters
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(address)) {
        return { isValid: false, error: 'Address contains invalid characters' };
      }

      return { isValid: true };

    } catch (error) {
      return { isValid: false, error: 'Address validation failed' };
    }
  }
}
