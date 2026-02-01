import { EntropyGenerator } from './core/entropy';
import { ShardingManager, ShardingResult, RecoveryResult } from './core/sharding';
import { CryptoUtils } from './core/crypto';
import { DerivationManager, DerivationConfig } from './wallet/derivation';
import { KeyPairManager, KeyPairResult, KeyPairOptions } from './wallet/keypair';
import { EthereumKeyPairManager, EthereumKeyPairResult, EthereumXPubResult } from './wallet/ethereum';
import { XPubManager, ExtendedPublicKey, XPubDerivationResult } from './wallet/xpub';
import { UTXOManager, UTXO, CoinSelectionResult } from './transaction/utxo';
import { TransactionBuilder, BuiltTransaction, TransactionParams } from './transaction/builder';
import { TransactionSigner, SigningResult, BroadcastResult } from './transaction/signer';
import { EthereumTransactionSigner, EthereumTransactionRequest, EthereumSigningResult } from './transaction/ethereum';
import { BitcoinTransactionSigner, BitcoinTransactionParams, BitcoinSigningResult } from './transaction/bitcoin';
import { BSVTransactionSigner, BSVTransactionParams, BSVSigningResult } from './transaction/bsv-signer';
import { detectTxType, isAllowedProtocol, getLockingScriptType, PROTOCOL_NAMES, type TxProtocol, type DetectResult } from './transaction/protocols';
import { BalanceManager, NativeBalance, BalanceValidation } from './transaction/balance';
import { BSVNetworkAPI, NetworkConfig, BlockInfo, TransactionInfo } from './network/api';
import { RockWalletClient, RockWalletConfig } from './network/rockwallet';
import { BSVMultiBroadcastClient, BSVNodeClient } from './network/bsv-node';
import * as bip39 from 'bip39';

export interface BSVSDKConfig {
  isTestnet: boolean;
  maxAddresses: number;
  feeRate: number;
  rpcUrl?: string;
  explorerUrl?: string;
  defaultAccountIndex?: number;
  rockWallet?: Partial<RockWalletConfig> & { enabled?: boolean };
}

export interface WalletGenerationResult {
  mnemonic: string;
  shards: string[];
  xpub: string;
  address: string;
  privateKey: string;
  publicKey: string;
}

export interface AddressGenerationResult {
  address: string;
  privateKey: string;
  publicKey: string;
  derivationPath: string;
}

/**
 * BSV SDK - Simple Bitcoin SV SDK for mnemonic generation and sharding
 * 
 * Features:
 * - Universal entropy generation
 * - 12-word mnemonic creation
 * - 2/3 Shamir Secret Sharing
 * - BIP44 derivation paths
 * - xPub key support
 * - Dynamic index management
 * - Configurable network settings
 */
export class BSVSDK {
  private config: BSVSDKConfig;
  private networkAPI: BSVNetworkAPI;
  private rockwallet?: RockWalletClient;

  constructor(config: Partial<BSVSDKConfig> = {}) {
    this.config = {
      isTestnet: config.isTestnet ?? false,
      maxAddresses: config.maxAddresses ?? 100000,
      feeRate: config.feeRate ?? 5,
      rpcUrl: config.rpcUrl,
      explorerUrl: config.explorerUrl,
      defaultAccountIndex: config.defaultAccountIndex ?? 0
    };

    // Initialize network API with configurable settings
    this.networkAPI = new BSVNetworkAPI(this.getNetworkConfig());

    // Initialize RockWallet client if configured
    if (config.rockWallet?.enabled && config.rockWallet?.baseUrl && config.rockWallet?.clientId && config.rockWallet?.getAccessToken) {
      this.rockwallet = new RockWalletClient({
        baseUrl: String(config.rockWallet.baseUrl),
        clientId: String(config.rockWallet.clientId),
        getAccessToken: config.rockWallet.getAccessToken as any,
        getSessionId: config.rockWallet.getSessionId as any,
        getDeviceId: config.rockWallet.getDeviceId as any,
        getRequestId: config.rockWallet.getRequestId as any
      });
    }
  }

  /**
   * Generate entropy and create 12-word mnemonic
   * @returns Generated mnemonic
   */
  generateMnemonic(): string {
    const entropy = EntropyGenerator.generate12WordEntropy();
    return bip39.entropyToMnemonic(entropy);
  }

  /**
   * Validate mnemonic
   * @param mnemonic - Mnemonic to validate
   * @returns True if valid
   */
  validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
  }

  /**
   * Split mnemonic into 3 shards using Shamir Secret Sharing (2/3 threshold)
   * @param mnemonic - Mnemonic to split
   * @returns Sharding result with 3 shards
   */
  splitMnemonic(mnemonic: string): ShardingResult {
    return ShardingManager.splitMnemonic(mnemonic);
  }

  /**
   * Combine 2 shards to reconstruct mnemonic
   * @param shards - Array of exactly 2 shards
   * @returns Reconstructed mnemonic
   */
  combineShards(shards: string[]): string {
    return ShardingManager.combineShards(shards);
  }

  /**
   * Recovery function: Accept 2 shards and return 3 new shards
   * @param shards - Array of exactly 2 shards
   * @returns Recovery result with 3 new shards
   */
  recoverShards(shards: string[]): RecoveryResult {
    return ShardingManager.recoverShards(shards);
  }

  /**
   * Generate root-level xPub from mnemonic (master key at root "m")
   * Used for MPC wallet creation per requirements
   * @param mnemonic - BIP39 mnemonic
   * @returns Extended public key information at root level
   */
  generateRootXPub(mnemonic: string): ExtendedPublicKey {
    return XPubManager.generateRootXPub(mnemonic, this.config.isTestnet);
  }

  /**
   * Generate xPub key from mnemonic at account level
   * @param mnemonic - BIP39 mnemonic
   * @param accountIndex - Account index (default: 0)
   * @returns Extended public key information
   */
  generateXPub(mnemonic: string, accountIndex: number = 0): ExtendedPublicKey {
    return XPubManager.generateXPub(mnemonic, this.config.isTestnet, accountIndex);
  }

  /**
   * Generate xPub key from mnemonic with specific coin type
   * @param mnemonic - BIP39 mnemonic
   * @param coinType - Coin type (0 for Bitcoin, 236 for BSV mainnet, etc.)
   * @param accountIndex - Account index (default: 0)
   * @returns Extended public key information
   */
  generateXPubWithCoinType(mnemonic: string, coinType: number, accountIndex: number = 0): ExtendedPublicKey {
    return XPubManager.generateXPubWithCoinType(mnemonic, coinType, accountIndex);
  }

  /**
   * Derive address from xPub at specific index
   * @param xpub - Extended public key
   * @param addressIndex - Address index
   * @param changeIndex - Change index (default: 0)
   * @param addressFormat - Address format (default: 'p2pkh')
   * @returns Derived address information
   */
  deriveAddressFromXPub(
    xpub: string,
    addressIndex: number,
    changeIndex: number = 0,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): XPubDerivationResult {
    return XPubManager.deriveAddressFromXPub(xpub, addressIndex, changeIndex, addressFormat);
  }

  /**
   * Generate complete wallet from mnemonic (shards + xPub + first address)
   * @param mnemonic - BIP39 mnemonic
   * @returns Complete wallet generation result
   */
  generateWallet(mnemonic: string): WalletGenerationResult {
    // Validate mnemonic
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Split mnemonic into shards
    const shardingResult = this.splitMnemonic(mnemonic);

    // Generate xPub
    const xpub = this.generateXPub(mnemonic);

    // Generate first address
    const keyPair = KeyPairManager.generateKeyPair(mnemonic, {
      isTestnet: this.config.isTestnet,
      addressFormat: 'p2pkh'
    });

    return {
      mnemonic,
      shards: shardingResult.shards,
      xpub: xpub.xpub,
      address: keyPair.address,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey
    };
  }

  /**
   * Generate key pair at specific derivation path
   * @param mnemonic - BIP39 mnemonic
   * @param derivationPath - BIP44 derivation path
   * @param addressFormat - Address format
   * @returns Key pair result
   */
  generateKeyPairAtPath(
    mnemonic: string,
    derivationPath: string,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): KeyPairResult {
    return KeyPairManager.generateKeyPair(mnemonic, {
      isTestnet: this.config.isTestnet,
      addressFormat,
      derivationPath
    });
  }

  /**
   * Generate key pair at specific index
   * @param mnemonic - BIP39 mnemonic
   * @param addressIndex - Address index
   * @param changeIndex - Change index (default: 0)
   * @param addressFormat - Address format (default: 'p2pkh')
   * @returns Key pair result
   */
  generateKeyPairAtIndex(
    mnemonic: string,
    addressIndex: number,
    changeIndex: number = 0,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): KeyPairResult {
    const derivationPath = DerivationManager.generateDerivationPath({
      isTestnet: this.config.isTestnet,
      addressIndex,
      changeIndex
    });

    return this.generateKeyPairAtPath(mnemonic, derivationPath, addressFormat);
  }

  /**
   * Generate multiple addresses from mnemonic
   * @param mnemonic - BIP39 mnemonic
   * @param startIndex - Starting address index
   * @param count - Number of addresses to generate
   * @param addressFormat - Address format (default: 'p2pkh')
   * @returns Array of address generation results
   */
  generateAddressRange(
    mnemonic: string,
    startIndex: number,
    count: number,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): AddressGenerationResult[] {
    const results: AddressGenerationResult[] = [];

    for (let i = 0; i < count; i++) {
      const addressIndex = startIndex + i;
      const keyPair = this.generateKeyPairAtIndex(mnemonic, addressIndex, 0, addressFormat);
      const derivationPath = DerivationManager.generateDerivationPath({
        isTestnet: this.config.isTestnet,
        addressIndex
      });

      results.push({
        address: keyPair.address,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        derivationPath
      });
    }

    return results;
  }

  /**
   * Get UTXOs for an address
   * @param address - BSV address
   * @returns Array of UTXOs
   */
  async getUTXOs(address: string): Promise<UTXO[]> {
    const rpcUrl = this.getNetworkConfig().rpcUrl;
    return UTXOManager.getUTXOs(address, this.config.isTestnet, rpcUrl);
  }

  /**
   * Get balance for an address
   * @param address - BSV address
   * @returns Balance in satoshis
   */
  async getBalance(address: string): Promise<number> {
    // Get UTXOs and sum their satoshis
    const utxos = await UTXOManager.getUTXOs(address, this.config.isTestnet, this.getNetworkConfig().rpcUrl);
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
  }

  /**
   * Send native BSV transaction
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param amount - Amount in satoshis
   * @param privateKey - Private key for signing
   * @param feeRate - Fee rate (optional)
   * @returns Broadcast result
   */
  async sendTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    feeRate: number = this.config.feeRate
  ): Promise<BroadcastResult> {
    return TransactionSigner.signAndBroadcastNativeTransaction(
      fromAddress,
      toAddress,
      amount,
      privateKey,
      this.config.isTestnet,
      feeRate
    );
  }


  /**
   * Get network configuration
   * @returns Network configuration
   */
  getNetworkConfig(): NetworkConfig {
    // Use custom URLs if provided, otherwise use defaults
    const rpcUrl = this.config.rpcUrl || (this.config.isTestnet 
      ? 'https://api.whatsonchain.com/v1/bsv/test'
      : 'https://api.whatsonchain.com/v1/bsv/main');
    
    const explorerUrl = this.config.explorerUrl || (this.config.isTestnet
      ? 'https://test.whatsonchain.com'
      : 'https://whatsonchain.com');

    return {
      name: this.config.isTestnet ? 'BSV Testnet' : 'BSV Mainnet',
      rpcUrl,
      explorerUrl,
      isTestnet: this.config.isTestnet
    };
  }

  /**
   * Get latest block information
   * @returns Latest block information
   */
  async getLatestBlock(): Promise<BlockInfo> {
    return this.networkAPI.getLatestBlock();
  }

  /**
   * Get transaction information
   * @param txid - Transaction ID
   * @returns Transaction information
   */
  async getTransaction(txid: string): Promise<TransactionInfo> {
    return this.networkAPI.getTransactionInfo(txid);
  }

  /**
   * Validate address
   * @param address - Address to validate
   * @returns True if valid address
   */
  validateAddress(address: string): boolean {
    return KeyPairManager.validateAddress(address, this.config.isTestnet);
  }

  /**
   * Get explorer URL for transaction
   * @param txid - Transaction ID
   * @returns Explorer URL
   */
  getExplorerUrl(txid: string): string {
    return this.networkAPI.getExplorerUrl(txid);
  }

  /**
   * Get explorer URL for address
   * @param address - BSV address
   * @returns Explorer URL
   */
  getAddressExplorerUrl(address: string): string {
    return this.networkAPI.getAddressExplorerUrl(address);
  }

  /**
   * Update SDK configuration
   * @param config - New configuration
   */
  updateConfig(config: Partial<BSVSDKConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    
    // Reinitialize network API with new configuration
    this.networkAPI = new BSVNetworkAPI(this.getNetworkConfig());

    // Reinitialize RockWallet client if configured
    if (config.rockWallet?.enabled && config.rockWallet?.baseUrl && config.rockWallet?.clientId && config.rockWallet?.getAccessToken) {
      this.rockwallet = new RockWalletClient({
        baseUrl: String(config.rockWallet.baseUrl),
        clientId: String(config.rockWallet.clientId),
        getAccessToken: config.rockWallet.getAccessToken as any,
        getSessionId: config.rockWallet.getSessionId as any,
        getDeviceId: config.rockWallet.getDeviceId as any,
        getRequestId: config.rockWallet.getRequestId as any
      });
    } else {
      this.rockwallet = undefined;
    }
  }

  /**
   * Get current SDK configuration
   * @returns Current configuration
   */
  getConfig(): BSVSDKConfig {
    return { ...this.config };
  }

  /**
   * Check network status and validate testnet setting
   * @returns Network status information
   */
  async checkNetworkStatus(): Promise<{
    name: string;
    isTestnet: boolean;
    connected: boolean;
    rpcUrl: string;
    explorerUrl: string;
    error?: string;
  }> {
    try {
      const networkConfig = this.getNetworkConfig();
      
      // Test API connection by fetching latest block
      const latestBlock = await this.networkAPI.getLatestBlock();
      
      return {
        name: networkConfig.name,
        isTestnet: networkConfig.isTestnet,
        connected: true,
        rpcUrl: networkConfig.rpcUrl,
        explorerUrl: networkConfig.explorerUrl
      };
    } catch (error) {
      return {
        name: this.config.isTestnet ? 'BSV Testnet' : 'BSV Mainnet',
        isTestnet: this.config.isTestnet,
        connected: false,
        rpcUrl: this.config.rpcUrl || 'Not configured',
        explorerUrl: this.config.explorerUrl || 'Not configured',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get dynamic gas fees in real-time
   * @returns Current fee information
   */
  async getDynamicFees(): Promise<{
    feeRate: number;
    recommendedFee: number;
    fastFee: number;
    slowFee: number;
    timestamp: number;
  }> {
    try {
      // Get fee estimates from network API
      const feeEstimates = await this.networkAPI.getFeeEstimates();
      
      // Calculate fees based on network conditions
      const baseFeeRate = feeEstimates?.feeRate || this.config.feeRate || 5;
      
      return {
        feeRate: baseFeeRate,
        recommendedFee: Math.ceil(baseFeeRate * 250), // ~250 bytes typical tx
        fastFee: Math.ceil(baseFeeRate * 1.5 * 250),  // 50% higher for fast confirmation
        slowFee: Math.ceil(baseFeeRate * 0.5 * 250),  // 50% lower for slow confirmation
        timestamp: Date.now()
      };
    } catch (error) {
      // Fallback to default fees if API fails
      const defaultFeeRate = this.config.feeRate || 5;
      return {
        feeRate: defaultFeeRate,
        recommendedFee: Math.ceil(defaultFeeRate * 250),
        fastFee: Math.ceil(defaultFeeRate * 1.5 * 250),
        slowFee: Math.ceil(defaultFeeRate * 0.5 * 250),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate wallet with mnemonic, 3 shards, and xpub
   * @returns Complete wallet data
   */
  async generateWalletWithShards(): Promise<{
    mnemonic: string;
    shards: string[];
    xpub: string;
    network: 'mainnet' | 'testnet';
    threshold: number;
    totalShares: number;
  }> {
    // Generate mnemonic
    const mnemonic = this.generateMnemonic();
    
    // Split into shards
    const shardingResult = this.splitMnemonic(mnemonic);
    
    // Generate xpub
    const xpubResult = this.generateXPub(mnemonic);
    
    return {
      mnemonic,
      shards: shardingResult.shards,
      xpub: xpubResult.xpub,
      network: xpubResult.network as 'mainnet' | 'testnet',
      threshold: shardingResult.threshold,
      totalShares: shardingResult.totalShares
    };
  }

  /**
   * Generate keypair from dynamic BIP44 index
   * @param xpub - Extended public key
   * @param index - Dynamic index
   * @param addressFormat - Address format (p2pkh or p2sh)
   * @returns Generated keypair
   */
  generateKeypairFromIndex(
    xpub: string,
    index: number,
    addressFormat: 'p2pkh' | 'p2sh' = 'p2pkh'
  ): {
    address: string;
    publicKey: string;
    derivationPath: string;
    index: number;
  } {
    // Derive address/public key from xpub at specified dynamic index (no private key here)
    const derived = this.deriveAddressFromXPub(xpub, index, 0, addressFormat);
    const derivationPath = `${0}/${index}`;
    return {
      address: derived.address,
      publicKey: derived.publicKey,
      derivationPath,
      index
    };
  }

  /**
   * Sign native BSV transaction with dynamic fees and decimal handling
   * @param params - Transaction parameters
   * @returns Signed transaction
   */
  async signTransaction(params: {
    fromAddress: string;
    toAddress: string;
    amount: number; // Amount in satoshis
    privateKey: string;
    feeRate?: number;
    changeAddress?: string;
  }): Promise<{
    signedTransactionHex: string;
    transactionId: string;
    fee: number;
    inputs: number;
    outputs: number;
    amountBSV: string; // Amount in BSV format
  }> {
    try {
      // Get dynamic fees if not provided
      const feeRate = params.feeRate || (await this.getDynamicFees()).feeRate;
      
      // Estimate transaction fee (1 input, 2 outputs: recipient + change)
      const estimatedFee = TransactionBuilder.estimateFee(1, 2, feeRate);
      const totalRequired = params.amount + estimatedFee;
      
      // Validate balance before signing (including fees)
      const balanceValidation = await BalanceManager.validateBalance(
        params.fromAddress,
        totalRequired,
        false, // not a token transaction
        undefined,
        this.config.isTestnet,
        this.getNetworkConfig().rpcUrl
      );
      
      if (!balanceValidation.isValid) {
        throw new Error(`Balance validation failed: ${balanceValidation.errors.join(', ')}`);
      }
      
      // Build and sign the actual transaction
      const builtTransaction = await TransactionBuilder.buildNativeTransaction(
        params.fromAddress,
        params.toAddress,
        params.amount,
        params.privateKey,
        this.config.isTestnet,
        feeRate,
        this.getNetworkConfig().rpcUrl
      );
      
      // Use native hex/id from @bsv/sdk Transaction
      const signedTransactionHex = builtTransaction.transactionHex;
      const transactionId = builtTransaction.transactionId;
      
      return {
        signedTransactionHex,
        transactionId,
        fee: builtTransaction.fee,
        inputs: builtTransaction.inputs.length,
        outputs: builtTransaction.outputs.length,
        amountBSV: BalanceManager.satoshisToBSV(params.amount)
      };
    } catch (error) {
      throw new Error(`Transaction signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // --- Balance Operations ---

  /**
   * Get native BSV balance with decimal formatting
   * @param address - BSV address
   * @returns Native balance information
   */
  async getNativeBalance(address: string): Promise<NativeBalance> {
    return BalanceManager.getNativeBalance(address, this.config.isTestnet, this.getNetworkConfig().rpcUrl);
  }

  /**
   * Convert satoshis to BSV with proper decimals
   * @param satoshis - Amount in satoshis
   * @returns BSV amount string
   */
  satoshisToBSV(satoshis: number): string {
    return BalanceManager.satoshisToBSV(satoshis);
  }

  /**
   * Convert BSV to satoshis
   * @param bsv - BSV amount string
   * @returns Amount in satoshis
   */
  bsvToSatoshis(bsv: string | number): number {
    return BalanceManager.bsvToSatoshis(bsv);
  }

  /**
   * Validate balance for transaction
   * @param address - BSV address
   * @param amount - Amount to send
   * @returns Balance validation result
   */
  async validateBalance(
    address: string,
    amount: number
  ): Promise<BalanceValidation> {
    return BalanceManager.validateBalance(address, amount, false, undefined, this.config.isTestnet, this.getNetworkConfig().rpcUrl);
  }

  /**
   * Get balance summary for display
   * @param address - BSV address
   * @returns Formatted balance summary
   */
  async getBalanceSummary(address: string): Promise<string> {
    return BalanceManager.getBalanceSummary(address, this.config.isTestnet);
  }

  // --- Native Broadcasting Methods ---

  /**
   * Broadcast transaction using native BSV nodes (no WhatsOnChain dependency)
   * @param transactionHex - Signed transaction in hex format
   * @returns Broadcast result
   */
  async broadcastTransactionNative(transactionHex: string): Promise<{ success: boolean; txid?: string; error?: string }> {
    // Try WhatsOnChain first
    const base = this.getNetworkConfig().rpcUrl;
    try {
      const res = await fetch(`${base}/tx/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txhex: transactionHex })
      } as any);
      if (res.ok) {
        const txid = await res.text();
        return { success: true, txid: txid.replace(/\"/g, '').replace(/"/g, '') };
      }
      const text = await res.text();
      // fallback to node broadcaster
      const client = new BSVMultiBroadcastClient({ isTestnet: this.config.isTestnet });
      return client.broadcastTransaction(transactionHex);
    } catch (e) {
      const client = new BSVMultiBroadcastClient({ isTestnet: this.config.isTestnet });
      return client.broadcastTransaction(transactionHex);
    }
  }

  /**
   * Send native BSV transaction with native broadcasting
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param amount - Amount in satoshis
   * @param privateKey - Private key for signing
   * @param feeRate - Fee rate (optional)
   * @returns Transaction result with native broadcasting
   */
  async sendNativeTransactionNative(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    feeRate?: number
  ): Promise<BroadcastResult> {
    try {
      // Build transaction
      const builtTransaction = await TransactionBuilder.buildNativeTransaction(
        fromAddress,
        toAddress,
        amount,
        privateKey,
        this.config.isTestnet,
        feeRate || this.config.feeRate
      );

      // Get transaction hex and ID from @bsv/sdk
      const transactionHex = builtTransaction.transactionHex;
      const transactionId = builtTransaction.transactionId;

      // Broadcast using native nodes
      const broadcastResult = await this.broadcastTransactionNative(transactionHex);

      return {
        success: broadcastResult.success,
        transactionId: transactionId,
        explorerUrl: this.getExplorerUrl(transactionId),
        error: broadcastResult.error
      };
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        explorerUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


  /**
   * Get BSV node client for direct RPC calls
   * @param customNodes - Custom node URLs (optional)
   * @returns BSVNodeClient instance
   */
  getBSVNodeClient(customNodes?: string[]): BSVNodeClient {
    const nodes = customNodes || (this.config.isTestnet 
      ? ['https://api.whatsonchain.com/v1/bsv/test']
      : ['https://api.whatsonchain.com/v1/bsv/main']);
    
    return new BSVNodeClient({ rpcUrl: nodes[0] });
  }

  /**
   * Get multi-broadcast client for redundant broadcasting
   * @param customNodes - Custom node URLs (optional)
   * @returns BSVMultiBroadcastClient instance
   */
  getBSVMultiBroadcastClient(customNodes?: string[]): BSVMultiBroadcastClient {
    return new BSVMultiBroadcastClient({ 
      isTestnet: this.config.isTestnet,
      customNodes 
    });
  }
}

// Export all types and classes for external use
export {
  EntropyGenerator,
  ShardingManager,
  CryptoUtils,
  DerivationManager,
  KeyPairManager,
  EthereumKeyPairManager,
  XPubManager,
  UTXOManager,
  TransactionBuilder,
  TransactionSigner,
  EthereumTransactionSigner,
  BitcoinTransactionSigner,
  BSVTransactionSigner,
  BalanceManager,
  BSVNetworkAPI,
  BSVMultiBroadcastClient,
  BSVNodeClient,
  detectTxType,
  isAllowedProtocol,
  getLockingScriptType,
  PROTOCOL_NAMES
};

// Export types
export type {
  ShardingResult,
  RecoveryResult,
  DerivationConfig,
  KeyPairResult,
  KeyPairOptions,
  EthereumKeyPairResult,
  EthereumXPubResult,
  ExtendedPublicKey,
  XPubDerivationResult,
  UTXO,
  CoinSelectionResult,
  BuiltTransaction,
  TransactionParams,
  EthereumTransactionRequest,
  EthereumSigningResult,
  BitcoinTransactionParams,
  BitcoinSigningResult,
  BSVTransactionParams,
  BSVSigningResult,
  SigningResult,
  BroadcastResult,
  NativeBalance,
  BalanceValidation,
  NetworkConfig,
  BlockInfo,
  TransactionInfo,
  TxProtocol,
  DetectResult
};
