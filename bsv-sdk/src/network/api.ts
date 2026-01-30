import axios, { AxiosResponse } from 'axios';

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
}

export interface BlockInfo {
  hash: string;
  height: number;
  timestamp: number;
  size: number;
  txCount: number;
  previousBlock: string;
  merkleRoot: string;
}

export interface TransactionInfo {
  txid: string;
  hash: string;
  size: number;
  vsize: number;
  weight: number;
  version: number;
  locktime: number;
  vin: any[];
  vout: any[];
  blockHeight?: number;
  blockHash?: string;
  confirmations?: number;
}

/**
 * BSV Network API Client
 * Handles communication with BSV blockchain APIs
 */
export class BSVNetworkAPI {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;
  private static readonly TIMEOUT = 15000;

  private config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Make HTTP request with retry logic
   * @param url - Request URL
   * @param options - Request options
   * @returns HTTP response
   */
  private async makeRequest(url: string, options: any = {}): Promise<AxiosResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= BSVNetworkAPI.MAX_RETRIES; attempt++) {
      try {
        const response = await axios({
          url,
          timeout: BSVNetworkAPI.TIMEOUT,
          headers: {
            'User-Agent': 'BSV-SDK/1.0.0',
            ...options.headers
          },
          ...options
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.log(`Request attempt ${attempt} failed: ${lastError.message}`);
        
        if (attempt < BSVNetworkAPI.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, BSVNetworkAPI.RETRY_DELAY * attempt));
        }
      }
    }

    throw new Error(`Request failed after ${BSVNetworkAPI.MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  /**
   * Get block information
   * @param blockHash - Block hash
   * @returns Block information
   */
  async getBlockInfo(blockHash: string): Promise<BlockInfo> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/block/${blockHash}`);
    
    return {
      hash: response.data.hash,
      height: response.data.height,
      timestamp: response.data.time,
      size: response.data.size,
      txCount: response.data.txcount,
      previousBlock: response.data.previousblockhash,
      merkleRoot: response.data.merkleroot
    };
  }

  /**
   * Get block by height
   * @param height - Block height
   * @returns Block information
   */
  async getBlockByHeight(height: number): Promise<BlockInfo> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/block/height/${height}`);
    
    return {
      hash: response.data.hash,
      height: response.data.height,
      timestamp: response.data.time,
      size: response.data.size,
      txCount: response.data.txcount,
      previousBlock: response.data.previousblockhash,
      merkleRoot: response.data.merkleroot
    };
  }

  /**
   * Get latest block
   * @returns Latest block information
   */
  async getLatestBlock(): Promise<BlockInfo> {
    // WhatsOnChain: fetch chain info to obtain best block hash, then fetch that block
    const chainInfo = await this.makeRequest(`${this.config.rpcUrl}/chain/info`);
    const bestHash: string = chainInfo.data.bestblockhash;
    const response = await this.makeRequest(`${this.config.rpcUrl}/block/${bestHash}`);
    
    return {
      hash: response.data.hash,
      height: response.data.height,
      timestamp: response.data.time,
      size: response.data.size,
      txCount: response.data.txcount,
      previousBlock: response.data.previousblockhash,
      merkleRoot: response.data.merkleroot
    };
  }

  /**
   * Get transaction information
   * @param txid - Transaction ID
   * @returns Transaction information
   */
  async getTransactionInfo(txid: string): Promise<TransactionInfo> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/tx/${txid}`);
    
    return {
      txid: response.data.txid,
      hash: response.data.hash,
      size: response.data.size,
      vsize: response.data.vsize,
      weight: response.data.weight,
      version: response.data.version,
      locktime: response.data.locktime,
      vin: response.data.vin,
      vout: response.data.vout,
      blockHeight: response.data.blockheight,
      blockHash: response.data.blockhash,
      confirmations: response.data.confirmations
    };
  }

  /**
   * Get address information
   * @param address - BSV address
   * @returns Address information
   */
  async getAddressInfo(address: string): Promise<any> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/address/${address}`);
    return response.data;
  }

  /**
   * Get address balance
   * @param address - BSV address
   * @returns Address balance
   */
  async getAddressBalance(address: string): Promise<number> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/address/${address}/balance`);
    return response.data.confirmed || 0;
  }

  /**
   * Get address UTXOs
   * @param address - BSV address
   * @returns Array of UTXOs
   */
  async getAddressUTXOs(address: string): Promise<any[]> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/address/${address}/unspent`);
    return response.data;
  }

  /**
   * Broadcast transaction
   * @param transactionHex - Transaction in hex format
   * @returns Broadcast result
   */
  async broadcastTransaction(transactionHex: string): Promise<any> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/tx/raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        txhex: transactionHex
      }
    });
    
    return response.data;
  }

  /**
   * Get transaction history for address
   * @param address - BSV address
   * @param limit - Number of transactions to return
   * @returns Transaction history
   */
  async getAddressHistory(address: string, limit: number = 100): Promise<any[]> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/address/${address}/txs?limit=${limit}`);
    return response.data;
  }

  /**
   * Get network statistics
   * @returns Network statistics
   */
  async getNetworkStats(): Promise<any> {
    const response = await this.makeRequest(`${this.config.rpcUrl}/stats`);
    return response.data;
  }

  /**
   * Get fee estimates
   * @returns Fee estimates
   */
  async getFeeEstimates(): Promise<{
    feeRate: number;
    timestamp: number;
  }> {
    // WhatsOnChain does not provide fee estimates; allow SDK to fall back to configured fee
    return {
      feeRate: undefined as unknown as number,
      timestamp: Date.now()
    };
  }

  /**
   * Validate address
   * @param address - Address to validate
   * @returns True if valid address
   */
  async validateAddress(address: string): Promise<boolean> {
    // Remote validation not supported by WOC; perform locally via wallet utilities instead
    return false;
  }

  /**
   * Get explorer URL for transaction
   * @param txid - Transaction ID
   * @returns Explorer URL
   */
  getExplorerUrl(txid: string): string {
    return `${this.config.explorerUrl}/tx/${txid}`;
  }

  /**
   * Get explorer URL for address
   * @param address - BSV address
   * @returns Explorer URL
   */
  getAddressExplorerUrl(address: string): string {
    return `${this.config.explorerUrl}/address/${address}`;
  }

  /**
   * Get explorer URL for block
   * @param blockHash - Block hash
   * @returns Explorer URL
   */
  getBlockExplorerUrl(blockHash: string): string {
    return `${this.config.explorerUrl}/block/${blockHash}`;
  }

  /**
   * Get current network configuration
   * @returns Network configuration
   */
  getNetworkConfig(): NetworkConfig {
    return { ...this.config };
  }

  /**
   * Update network configuration
   * @param newConfig - New network configuration
   */
  updateNetworkConfig(newConfig: Partial<NetworkConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}