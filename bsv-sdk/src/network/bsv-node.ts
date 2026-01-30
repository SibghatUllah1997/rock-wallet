import axios, { AxiosResponse } from 'axios';

export interface BSVNodeConfig {
  rpcUrl: string;
  rpcUser?: string;
  rpcPassword?: string;
  timeout?: number;
  retries?: number;
}

export interface BroadcastResult {
  success: boolean;
  txid?: string;
  error?: string;
}

export class BSVNodeClient {
  private config: BSVNodeConfig;

  constructor(config: BSVNodeConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config
    };
  }

  private async makeRpcRequest(method: string, params: any[] = []): Promise<any> {
    const url = this.config.rpcUrl;
    const auth = this.config.rpcUser && this.config.rpcPassword 
      ? { username: this.config.rpcUser, password: this.config.rpcPassword }
      : undefined;

    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    try {
      const response = await axios.post(url, payload, {
        auth,
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`RPC Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(`RPC Error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  async broadcastTransaction(txHex: string): Promise<BroadcastResult> {
    try {
      const txid = await this.makeRpcRequest('sendrawtransaction', [txHex]);
      return { success: true, txid };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Broadcast failed' 
      };
    }
  }

  async getRawTransaction(txid: string): Promise<string> {
    return this.makeRpcRequest('getrawtransaction', [txid]);
  }

  async getTransaction(txid: string): Promise<any> {
    return this.makeRpcRequest('gettransaction', [txid]);
  }

  async getBlockchainInfo(): Promise<any> {
    return this.makeRpcRequest('getblockchaininfo');
  }

  async getNetworkInfo(): Promise<any> {
    return this.makeRpcRequest('getnetworkinfo');
  }

  async estimateFee(blocks: number = 6): Promise<number> {
    try {
      const feeRate = await this.makeRpcRequest('estimatesmartfee', [blocks]);
      return feeRate.feerate ? Math.ceil(feeRate.feerate * 100000000) : 1000; // Convert to satoshis
    } catch (error) {
      return 1000; // Fallback fee rate
    }
  }

  async validateAddress(address: string): Promise<{ isValid: boolean; isScript: boolean; address: string }> {
    try {
      const result = await this.makeRpcRequest('validateaddress', [address]);
      return {
        isValid: result.isvalid,
        isScript: result.isscript || false,
        address: result.address || address
      };
    } catch (error) {
      return { isValid: false, isScript: false, address };
    }
  }

  async getBlockCount(): Promise<number> {
    return this.makeRpcRequest('getblockcount');
  }

  async getBlockHash(height: number): Promise<string> {
    return this.makeRpcRequest('getblockhash', [height]);
  }

  async getBlock(hash: string): Promise<any> {
    return this.makeRpcRequest('getblock', [hash]);
  }

  async getBestBlockHash(): Promise<string> {
    return this.makeRpcRequest('getbestblockhash');
  }
}

// Public BSV node endpoints (no authentication required)
export const PUBLIC_BSV_NODES = {
  mainnet: [
    'https://api.bitails.io/api',
    'https://api.whatsonchain.com/v1/bsv/main',
    'https://api.bitails.io/api'
  ],
  testnet: [
    'https://api.whatsonchain.com/v1/bsv/test',
    'https://testnet.api.bitails.io/api'
  ]
};

// Fallback broadcasting using multiple methods
export class BSVMultiBroadcastClient {
  private clients: BSVNodeClient[] = [];
  private fallbackUrls: string[] = [];

  constructor(config: { isTestnet: boolean; customNodes?: string[] }) {
    const nodes = config.customNodes || PUBLIC_BSV_NODES[config.isTestnet ? 'testnet' : 'mainnet'];
    
    // Create BSV node clients
    nodes.forEach(nodeUrl => {
      this.clients.push(new BSVNodeClient({ rpcUrl: nodeUrl }));
    });

    // Add HTTP broadcast endpoints as fallback
    this.fallbackUrls = config.isTestnet 
      ? ['https://api.whatsonchain.com/v1/bsv/test/tx/raw']
      : ['https://api.whatsonchain.com/v1/bsv/main/tx/raw'];
  }

  async broadcastTransaction(txHex: string): Promise<BroadcastResult> {
    // Try BSV node RPC first
    for (const client of this.clients) {
      try {
        const result = await client.broadcastTransaction(txHex);
        if (result.success) {
          return result;
        }
      } catch (error) {
        console.warn('BSV node broadcast failed:', error);
        continue;
      }
    }

    // Fallback to HTTP endpoints (WhatsOnChain API format)
    for (const url of this.fallbackUrls) {
      try {
        // WhatsOnChain expects JSON format: { txhex: "..." }
        const response = await axios.post(url, 
          { txhex: txHex },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
          }
        );

        if (response.status === 200) {
          // WhatsOnChain returns: { txid: "..." } on success
          const txid = response.data?.txid || (typeof response.data === 'string' ? response.data : null);
          if (txid) {
            return { success: true, txid };
          }
        }
      } catch (error: any) {
        // Try to extract error message for better debugging
        const errorMsg = error.response?.data?.message || error.message || 'HTTP broadcast failed';
        console.warn('HTTP broadcast failed:', errorMsg);
        continue;
      }
    }

    return { success: false, error: 'All BSV broadcast methods failed' };
  }
}
