import * as crypto from 'crypto';

export interface UTXO {
  txid: string;
  vout: number;
  satoshis: number;
  value?: number; // Alias for satoshis for compatibility with builder
  script: string;
  address: string;
  height?: number;
  confirmations?: number;
  coinbase?: boolean;
}

export interface UTXOFilter {
  address?: string;
  minSatoshis?: number;
  maxSatoshis?: number;
  minConfirmations?: number;
  excludeCoinbase?: boolean;
}

export interface CoinSelectionResult {
  utxos: UTXO[];
  totalInput: number;
  change: number;
  fee: number;
  strategy: string;
}

export interface CoinSelectionOptions {
  strategy: 'smallest-first' | 'largest-first' | 'random' | 'optimal';
  maxInputs?: number;
  minChange?: number;
  feeRate?: number;
}

/**
 * UTXO Management and Coin Selection Service
 * Handles UTXO tracking, filtering, and coin selection algorithms
 */
export class UTXOManager {
  private utxos: Map<string, UTXO> = new Map();
  private lastSyncTime: number = 0;
  private syncInterval: number = 60000; // 1 minute

  constructor(
    private networkAPI: any,
    private syncIntervalMs: number = 60000
  ) {
    this.syncInterval = syncIntervalMs;
  }

  /**
   * Add UTXO to the manager
   * @param utxo - UTXO to add
   */
  addUTXO(utxo: UTXO): void {
    const key = `${utxo.txid}:${utxo.vout}`;
    this.utxos.set(key, utxo);
  }

  /**
   * Remove UTXO from the manager (when spent)
   * @param txid - Transaction ID
   * @param vout - Output index
   */
  removeUTXO(txid: string, vout: number): void {
    const key = `${txid}:${vout}`;
    this.utxos.delete(key);
  }

  /**
   * Get UTXOs for an address
   * @param address - Bitcoin address
   * @param filter - Optional filter criteria
   * @returns Filtered UTXOs
   */
  getUTXOs(address: string, filter?: UTXOFilter): UTXO[] {
    const utxos = Array.from(this.utxos.values())
      .filter(utxo => utxo.address === address);

    if (!filter) return utxos;

    return utxos.filter(utxo => {
      if (filter.minSatoshis && utxo.satoshis < filter.minSatoshis) return false;
      if (filter.maxSatoshis && utxo.satoshis > filter.maxSatoshis) return false;
      if (filter.minConfirmations && (utxo.confirmations || 0) < filter.minConfirmations) return false;
      if (filter.excludeCoinbase && utxo.coinbase) return false;
      return true;
    });
  }

  /**
   * Get total balance for an address
   * @param address - Bitcoin address
   * @param filter - Optional filter criteria
   * @returns Total balance in satoshis
   */
  getBalance(address: string, filter?: UTXOFilter): number {
    const utxos = this.getUTXOs(address, filter);
    return utxos.reduce((total, utxo) => total + utxo.satoshis, 0);
  }

  /**
   * Sync UTXOs from blockchain
   * @param address - Address to sync
   * @param force - Force sync even if recently synced
   */
  async syncUTXOs(address: string, force: boolean = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastSyncTime < this.syncInterval) {
      return;
    }

    try {
      // Use correct method name: getAddressUTXOs (not getUTXOs)
      const utxos = await this.networkAPI.getAddressUTXOs(address);
      
      // Clear existing UTXOs for this address
      const existingKeys = Array.from(this.utxos.keys())
        .filter(key => this.utxos.get(key)?.address === address);
      existingKeys.forEach(key => this.utxos.delete(key));

      // Map networkAPI response to UTXO format
      // WhatsOnChain returns: { tx_hash, tx_pos, value, height, script }
      utxos.forEach((utxo: any) => {
        // Map WhatsOnChain format to our UTXO format
        this.addUTXO({
          txid: utxo.tx_hash || utxo.txid,
          vout: utxo.tx_pos !== undefined ? utxo.tx_pos : utxo.vout,
          satoshis: utxo.value || utxo.satoshis,
          script: utxo.script || utxo.scriptPubKey || '', // Ensure script is always present
          address: address,
          height: utxo.height,
          confirmations: utxo.confirmations,
          coinbase: utxo.coinbase || false
        });
      });

      this.lastSyncTime = now;
    } catch (error) {
      throw new Error(`Failed to sync UTXOs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Select coins for transaction
   * @param address - Address to select coins from
   * @param amount - Amount needed in satoshis
   * @param options - Coin selection options
   * @returns Coin selection result
   */
  selectCoins(
    address: string,
    amount: number,
    options: CoinSelectionOptions = { strategy: 'optimal' }
  ): CoinSelectionResult {
    const utxos = this.getUTXOs(address, {
      minConfirmations: 1,
      excludeCoinbase: true
    });

    if (utxos.length === 0) {
      throw new Error('No UTXOs available for spending');
    }

    const feeRate = options.feeRate || 5; // satoshis per byte
    const estimatedFee = this.estimateFee(1, 2, feeRate); // 1 input, 2 outputs
    const totalNeeded = amount + estimatedFee;

    let selectedUTXOs: UTXO[] = [];
    let totalInput = 0;

    switch (options.strategy) {
      case 'smallest-first':
        selectedUTXOs = this.selectSmallestFirst(utxos, totalNeeded, options.maxInputs);
        break;
      case 'largest-first':
        selectedUTXOs = this.selectLargestFirst(utxos, totalNeeded, options.maxInputs);
        break;
      case 'random':
        selectedUTXOs = this.selectRandom(utxos, totalNeeded, options.maxInputs);
        break;
      case 'optimal':
      default:
        selectedUTXOs = this.selectOptimal(utxos, totalNeeded, options.maxInputs);
        break;
    }

    totalInput = selectedUTXOs.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    const finalFee = this.estimateFee(selectedUTXOs.length, 2, feeRate);
    const change = totalInput - amount - finalFee;

    return {
      utxos: selectedUTXOs,
      totalInput,
      change: Math.max(0, change),
      fee: finalFee,
      strategy: options.strategy
    };
  }

  /**
   * Select smallest UTXOs first
   */
  private selectSmallestFirst(utxos: UTXO[], target: number, maxInputs?: number): UTXO[] {
    const sorted = [...utxos].sort((a, b) => a.satoshis - b.satoshis);
    return this.selectUTXOs(sorted, target, maxInputs);
  }

  /**
   * Select largest UTXOs first
   */
  private selectLargestFirst(utxos: UTXO[], target: number, maxInputs?: number): UTXO[] {
    const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis);
    return this.selectUTXOs(sorted, target, maxInputs);
  }

  /**
   * Select UTXOs randomly
   */
  private selectRandom(utxos: UTXO[], target: number, maxInputs?: number): UTXO[] {
    const shuffled = [...utxos].sort(() => Math.random() - 0.5);
    return this.selectUTXOs(shuffled, target, maxInputs);
  }

  /**
   * Select optimal UTXOs (combination of size and count)
   */
  private selectOptimal(utxos: UTXO[], target: number, maxInputs?: number): UTXO[] {
    // First try largest-first for efficiency
    const largestFirst = this.selectLargestFirst(utxos, target, maxInputs);
    const largestFee = this.estimateFee(largestFirst.length, 2, 5);
    
    // Then try smallest-first for privacy
    const smallestFirst = this.selectSmallestFirst(utxos, target, maxInputs);
    const smallestFee = this.estimateFee(smallestFirst.length, 2, 5);
    
    // Choose the option with lower total cost (amount + fee)
    const largestTotal = target + largestFee;
    const smallestTotal = target + smallestFee;
    
    return smallestTotal <= largestTotal ? smallestFirst : largestFirst;
  }

  /**
   * Select UTXOs from sorted array
   */
  private selectUTXOs(sortedUTXOs: UTXO[], target: number, maxInputs?: number): UTXO[] {
    const selected: UTXO[] = [];
    let total = 0;

    for (const utxo of sortedUTXOs) {
      if (maxInputs && selected.length >= maxInputs) break;
      selected.push(utxo);
      total += utxo.satoshis;
      if (total >= target) break;
    }

    if (total < target) {
      throw new Error(`Insufficient funds: need ${target} satoshis, have ${total} satoshis`);
    }

    return selected;
  }

  /**
   * Estimate transaction fee
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate in satoshis per byte
   * @returns Estimated fee in satoshis
   */
  private estimateFee(inputCount: number, outputCount: number, feeRate: number): number {
    // Base transaction size: version (4) + input count (1-9) + output count (1-9) + locktime (4)
    let size = 4 + 1 + 1 + 4;
    
    // Input size: previous output (36) + script length (1-9) + script (107) + sequence (4)
    size += inputCount * (36 + 1 + 107 + 4);
    
    // Output size: value (8) + script length (1-9) + script (25)
    size += outputCount * (8 + 1 + 25);
    
    return size * feeRate;
  }

  /**
   * Clear all UTXOs
   */
  clear(): void {
    this.utxos.clear();
  }

  /**
   * Get UTXO count
   */
  getUTXOCount(): number {
    return this.utxos.size;
  }

  /**
   * Get all UTXOs
   */
  getAllUTXOs(): UTXO[] {
    return Array.from(this.utxos.values());
  }

  // ========== Static Methods for Direct Network Access ==========

  /**
   * Static method: Get UTXOs for an address directly from network
   * @param address - BSV address
   * @param isTestnet - Network type
   * @returns Array of UTXOs
   */
  static async getUTXOs(address: string, isTestnet: boolean = false, apiBaseUrl?: string): Promise<UTXO[]> {
    try {
      const apiUrl = (apiBaseUrl && apiBaseUrl.length > 0)
        ? apiBaseUrl
        : (isTestnet
          ? 'https://api.whatsonchain.com/v1/bsv/test'
          : 'https://api.whatsonchain.com/v1/bsv/main');
      
      const response = await fetch(`${apiUrl}/address/${address}/unspent`, {
        headers: { 'User-Agent': 'BSV-SDK/1.0.0' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
      }

      const data = await response.json() as any[];
      
      // Map WhatsOnChain format to our UTXO format
      return data.map((utxo: any) => ({
        txid: utxo.tx_hash || utxo.txid,
        vout: utxo.tx_pos !== undefined ? utxo.tx_pos : utxo.vout,
        satoshis: utxo.value || utxo.satoshis,
        value: utxo.value || utxo.satoshis, // Alias for compatibility
        script: utxo.script || utxo.scriptPubKey || utxo.hex || '',
        address: address,
        height: utxo.height,
        confirmations: utxo.confirmations,
        coinbase: utxo.coinbase || false
      }));
    } catch (error) {
      throw new Error(`Failed to get UTXOs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Static method: Select optimal UTXOs for transaction
   * @param utxos - Available UTXOs
   * @param amount - Amount needed in satoshis
   * @param feeRate - Fee rate in satoshis per byte
   * @returns Selection result
   */
  static selectOptimalUTXOs(
    utxos: UTXO[],
    amount: number,
    feeRate: number = 5
  ): { selectedUtxos: UTXO[]; change: number; fee: number } {
    if (utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    // Sort by value (smallest first for privacy)
    const sorted = [...utxos].sort((a, b) => (a.value || a.satoshis) - (b.value || b.satoshis));

    let selected: UTXO[] = [];
    let totalValue = 0;
    const estimatedSize = 250; // Rough estimate for transaction size
    const estimatedFee = feeRate * estimatedSize;

    // Select UTXOs until we have enough
    for (const utxo of sorted) {
      selected.push(utxo);
      totalValue += utxo.value || utxo.satoshis;

      // Check if we have enough (amount + fee)
      if (totalValue >= amount + estimatedFee) {
        break;
      }
    }

    if (totalValue < amount + estimatedFee) {
      throw new Error(`Insufficient funds: need ${amount + estimatedFee} satoshis, have ${totalValue} satoshis`);
    }

    // Calculate actual fee and change
    const actualFee = feeRate * estimatedSize;
    const change = totalValue - amount - actualFee;

    return {
      selectedUtxos: selected,
      change: Math.max(0, change),
      fee: actualFee
    };
  }
}