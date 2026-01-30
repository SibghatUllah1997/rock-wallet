import { BSVSDK } from '../../../bsv-sdk/dist/index';

export interface TransactionParams {
  fromAddress: string;
  toAddress: string;
  amount: number; // in satoshis
  privateKey: string;
  feeRate?: number;
  changeAddress?: string;
}

export interface TokenTransactionParams {
  fromAddress: string;
  toAddress: string;
  tokenId: string;
  amount: number; // raw token amount
  privateKey: string;
  feeRate?: number;
  changeAddress?: string;
}

export interface BalanceInfo {
  native: {
    confirmed: number;
    unconfirmed: number;
    total: number;
    bsv: string;
    utxos: number;
  };
  tokens: Array<{
    tokenId: string;
    symbol: string;
    name: string;
    balance: number;
    decimals: number;
    formattedBalance: string;
    utxos: number;
  }>;
}

export class BSVService {
  private sdk: BSVSDK;
  private isTestnet: boolean;

  constructor(isTestnet: boolean = true) {
    this.isTestnet = isTestnet;
    
    // Use environment URLs if provided, otherwise derive from network
    const rpcUrl = process.env.BSV_RPC_URL || (
      isTestnet 
        ? 'https://api.whatsonchain.com/v1/bsv/test'
        : 'https://api.whatsonchain.com/v1/bsv/main'
    );
    const explorerUrl = process.env.BSV_EXPLORER_URL || (
      isTestnet
        ? 'https://test.whatsonchain.com'
        : 'https://whatsonchain.com'
    );
    
    this.sdk = new BSVSDK({
      isTestnet: this.isTestnet,
      maxAddresses: 100000,
      feeRate: 5,
      rpcUrl,
      explorerUrl
    });
  }

  /**
   * Generate keypair from mnemonic and derivation path
   */
  generateKeypairFromMnemonic(mnemonic: string, addressIndex: number = 0): {
    address: string;
    privateKey: string;
    publicKey: string;
    derivationPath: string;
  } {
    const keypair = this.sdk.generateKeyPairAtIndex(mnemonic, addressIndex, 0, 'p2pkh');
    return {
      address: keypair.address,
      privateKey: keypair.privateKey,
      publicKey: keypair.publicKey,
      derivationPath: `m/44'/0'/0'/0/${addressIndex}`
    };
  }

  /**
   * Generate xPub from mnemonic
   */
  generateXPub(mnemonic: string, accountIndex: number = 0): {
    xpub: string;
    network: string;
    derivationPath: string;
    publicKey: string;
    chainCode: string;
  } {
    return this.sdk.generateXPub(mnemonic, accountIndex);
  }

  /**
   * Derive address from xPub
   */
  deriveAddressFromXPub(xpub: string, addressIndex: number, changeIndex: number = 0): {
    address: string;
    publicKey: string;
    derivationPath: string;
  } {
    return this.sdk.deriveAddressFromXPub(xpub, addressIndex, changeIndex, 'p2pkh');
  }

  /**
   * Sign native BSV transaction
   */
  async signTransaction(params: TransactionParams): Promise<{
    signedTransactionHex: string;
    transactionId: string;
    fee: number;
    inputs: number;
    outputs: number;
    amountBSV: string;
  }> {
    return this.sdk.signTransaction(params);
  }

  /**
   * Sign token transaction
   */
  async signTokenTransaction(params: TokenTransactionParams): Promise<{
    signedTransactionHex: string;
    transactionId: string;
    fee: number;
    inputs: number;
    outputs: number;
    tokenAmount: string;
  }> {
    throw new Error('Token transactions not supported - native BSV only');
  }

  /**
   * Get complete balance for address (native BSV only)
   */
  async getBalance(address: string): Promise<BalanceInfo> {
    const nativeBalance = await this.sdk.getNativeBalance(address);
    return {
      native: nativeBalance,
      tokens: [] // Native BSV only - no tokens
    };
  }

  /**
   * Get native BSV balance
   */
  async getNativeBalance(address: string): Promise<{
    confirmed: number;
    unconfirmed: number;
    total: number;
    bsv: string;
    utxos: number;
  }> {
    return this.sdk.getNativeBalance(address);
  }

  /**
   * Get token balances (native BSV only - returns empty array)
   */
  async getTokenBalances(address: string): Promise<Array<{
    tokenId: string;
    symbol: string;
    name: string;
    balance: number;
    decimals: number;
    formattedBalance: string;
    utxos: number;
  }>> {
    return []; // Native BSV only - no tokens
  }

  /**
   * Validate address
   */
  validateAddress(address: string): boolean {
    return this.sdk.validateAddress(address);
  }

  /**
   * Get dynamic fees
   */
  async getDynamicFees(): Promise<{
    feeRate: number;
    recommendedFee: number;
    fastFee: number;
    slowFee: number;
    timestamp: number;
  }> {
    return this.sdk.getDynamicFees();
  }

  /**
   * Check network status
   */
  async checkNetworkStatus(): Promise<{
    name: string;
    isTestnet: boolean;
    connected: boolean;
    rpcUrl: string;
    explorerUrl: string;
    error?: string;
  }> {
    return this.sdk.checkNetworkStatus();
  }

  /**
   * Convert satoshis to BSV
   */
  satoshisToBSV(satoshis: number): string {
    return this.sdk.satoshisToBSV(satoshis);
  }

  /**
   * Convert BSV to satoshis
   */
  bsvToSatoshis(bsv: string | number): number {
    return this.sdk.bsvToSatoshis(bsv);
  }

  /**
   * Format token amount (not supported - native BSV only)
   */
  formatTokenAmount(rawAmount: number, decimals: number): string {
    throw new Error('Token operations not supported - native BSV only');
  }

  /**
   * Parse token amount (not supported - native BSV only)
   */
  parseTokenAmount(amount: string | number, decimals: number): number {
    throw new Error('Token operations not supported - native BSV only');
  }

  /**
   * Validate balance for transaction
   */
  async validateBalance(address: string, amount: number, isToken: boolean = false, tokenId?: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    // Native BSV only - ignore token parameters
    if (isToken) {
      return {
        isValid: false,
        errors: ['Token transactions not supported - native BSV only'],
        warnings: []
      };
    }
    return this.sdk.validateBalance(address, amount);
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txid: string): string {
    return this.sdk.getExplorerUrl(txid);
  }

  /**
   * Get explorer URL for address
   */
  getAddressExplorerUrl(address: string): string {
    return this.sdk.getAddressExplorerUrl(address);
  }

  /**
   * Broadcast transaction using native BSV nodes
   */
  async broadcastTransactionNative(transactionHex: string): Promise<{ success: boolean; txid?: string; error?: string }> {
    return this.sdk.broadcastTransactionNative(transactionHex);
  }

  /**
   * Get transaction information from blockchain
   */
  async getTransaction(txid: string): Promise<{
    txid: string;
    hash: string;
    confirmations?: number;
    blockHeight?: number;
    vin?: any[];
    vout?: any[];
  } | null> {
    try {
      const txInfo = await this.sdk.getTransaction(txid);
      return {
        txid: txInfo.txid,
        hash: txInfo.hash,
        confirmations: txInfo.confirmations,
        blockHeight: txInfo.blockHeight,
        vin: txInfo.vin,
        vout: txInfo.vout
      };
    } catch (error) {
      console.error('Error getting transaction:', error);
      return null;
    }
  }
}
