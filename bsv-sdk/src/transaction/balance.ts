import { UTXOManager } from './utxo';

export interface NativeBalance {
  confirmed: number;      // Confirmed balance in satoshis
  unconfirmed: number;    // Unconfirmed balance in satoshis
  total: number;          // Total balance in satoshis
  bsv: string;           // Balance in BSV (with decimals)
  utxos: number;         // Number of UTXOs
}

export interface TokenBalanceInfo {
  tokenId: string;
  symbol: string;
  name: string;
  balance: number;        // Raw balance (without decimals)
  decimals: number;       // Token decimals
  formattedBalance: string; // Balance with proper decimal formatting
  utxos: number;         // Number of UTXOs containing this token
}

export interface CompleteBalance {
  native: NativeBalance;
  tokens: TokenBalanceInfo[];
  totalValueUSD?: number; // Optional USD value
}

export interface BalanceValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive Balance Management for BSV
 * Handles both native BSV and non-native tokens with proper decimal handling
 */
export class BalanceManager {
  private static readonly BSV_DECIMALS = 8; // BSV has 8 decimal places
  private static readonly DUST_LIMIT = 546; // BSV dust limit in satoshis

  /**
   * Get comprehensive balance for an address (native BSV only)
   * @param address - BSV address
   * @param isTestnet - Network type
   * @returns Complete balance information
   */
  static async getCompleteBalance(address: string, isTestnet: boolean = false, apiBaseUrl?: string): Promise<CompleteBalance> {
    try {
      // Get native BSV balance
      const nativeBalance = await this.getNativeBalance(address, isTestnet, apiBaseUrl);
      
      // Native BSV only - no tokens
      return {
        native: nativeBalance,
        tokens: []
      };
    } catch (error) {
      throw new Error(`Failed to get complete balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get native BSV balance with proper decimal handling
   * @param address - BSV address
   * @param isTestnet - Network type
   * @returns Native balance information
   */
  static async getNativeBalance(address: string, isTestnet: boolean = false, apiBaseUrl?: string): Promise<NativeBalance> {
    try {
      // Get UTXOs for detailed balance calculation
      const utxos = await UTXOManager.getUTXOs(address, isTestnet, apiBaseUrl);
      
      // WhatsOnChain /address/{addr}/unspent returns only confirmed UTXOs.
      // Treat all returned UTXOs as confirmed to match explorer totals.
      const confirmed = utxos.reduce((sum, u) => sum + u.satoshis, 0);
      const unconfirmed = 0;
      const total = confirmed;
      
      return {
        confirmed,
        unconfirmed,
        total,
        bsv: this.satoshisToBSV(total),
        utxos: utxos.length
      };
    } catch (error) {
      throw new Error(`Failed to get native balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  

  /**
   * Convert satoshis to BSV with proper decimal formatting
   * @param satoshis - Amount in satoshis
   * @returns BSV amount as string with proper decimals
   */
  static satoshisToBSV(satoshis: number): string {
    const bsv = satoshis / Math.pow(10, this.BSV_DECIMALS);
    return bsv.toFixed(this.BSV_DECIMALS);
  }

  /**
   * Convert BSV to satoshis
   * @param bsv - BSV amount as string or number
   * @returns Amount in satoshis
   */
  static bsvToSatoshis(bsv: string | number): number {
    const bsvNumber = typeof bsv === 'string' ? parseFloat(bsv) : bsv;
    return Math.floor(bsvNumber * Math.pow(10, this.BSV_DECIMALS));
  }

  /**
   * Format token balance with proper decimal places
   * @param balance - Raw token balance
   * @param decimals - Token decimals
   * @returns Formatted balance string
   */
  static formatTokenBalance(balance: number, decimals: number): string {
    const formatted = balance / Math.pow(10, decimals);
    return formatted.toFixed(decimals);
  }

  /**
   * Convert token amount to raw units
   * @param amount - Token amount with decimals
   * @param decimals - Token decimals
   * @returns Raw token amount
   */
  static tokenAmountToRaw(amount: string | number, decimals: number): number {
    const amountNumber = typeof amount === 'string' ? parseFloat(amount) : amount;
    return Math.floor(amountNumber * Math.pow(10, decimals));
  }

  /**
   * Validate balance for transaction
   * @param address - BSV address
   * @param amount - Amount to send (in satoshis for native, raw units for tokens)
   * @param isToken - Whether this is a token transaction
   * @param tokenId - Token ID (required for token transactions)
   * @param isTestnet - Network type
   * @returns Balance validation result
   */
  static async validateBalance(
    address: string,
    amount: number,
    isToken: boolean = false,
    tokenId?: string,
    isTestnet: boolean = false,
    apiBaseUrl?: string
  ): Promise<BalanceValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (isToken) {
        if (!tokenId) {
          errors.push('Token ID is required for token transactions');
        } else {
          errors.push('Token transactions are not supported - native BSV only');
        }
      } else {
        // Native BSV validation - ONLY use confirmed balance
        const nativeBalance = await this.getNativeBalance(address, isTestnet, apiBaseUrl);
        
        if (amount < this.DUST_LIMIT) {
          errors.push(`Amount ${amount} satoshis is below dust limit (${this.DUST_LIMIT} satoshis)`);
        }
        
        // Only check confirmed balance, ignore unconfirmed
        if (nativeBalance.confirmed < amount) {
          errors.push(`Insufficient BSV balance. Required: ${amount} satoshis, Available: ${nativeBalance.confirmed} satoshis (confirmed only)`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to validate balance: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  /**
   * Calculate transaction fees for native BSV
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate in satoshis per byte
   * @returns Calculated fee in satoshis
   */
  static calculateNativeFee(inputCount: number, outputCount: number, feeRate: number): number {
    // Simplified fee calculation (in practice, you'd use actual transaction size)
    const baseSize = 10; // Base transaction size
    const inputSize = 148; // P2PKH input size
    const outputSize = 34; // P2PKH output size
    
    const totalSize = baseSize + (inputCount * inputSize) + (outputCount * outputSize);
    return Math.ceil(totalSize * feeRate);
  }

  /**
   * Calculate transaction fees for token transactions
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param opReturnSize - Size of OP_RETURN data
   * @param feeRate - Fee rate in satoshis per byte
   * @returns Calculated fee in satoshis
   */
  static calculateTokenFee(inputCount: number, outputCount: number, opReturnSize: number, feeRate: number): number {
    const baseSize = 10;
    const inputSize = 148;
    const outputSize = 34;
    const opReturnOutputSize = 1 + opReturnSize; // OP_RETURN + data
    
    const totalSize = baseSize + (inputCount * inputSize) + (outputCount * outputSize) + opReturnOutputSize;
    return Math.ceil(totalSize * feeRate);
  }

  /**
   * Check if address has sufficient balance for transaction with fees
   * @param address - BSV address
   * @param amount - Amount to send
   * @param fee - Transaction fee
   * @param isToken - Whether this is a token transaction
   * @param tokenId - Token ID (for token transactions)
   * @param isTestnet - Network type
   * @returns True if sufficient balance
   */
  static async hasSufficientBalance(
    address: string,
    amount: number,
    fee: number,
    isToken: boolean = false,
    tokenId?: string,
    isTestnet: boolean = false,
    apiBaseUrl?: string
  ): Promise<boolean> {
    try {
      if (isToken) {
        // For token transactions, check token balance and native BSV for fees
        if (!tokenId) return false;
        
        // Token transactions not supported - native BSV only
        return false;
      } else {
        // For native transactions, check confirmed balance only
        const nativeBalance = await this.getNativeBalance(address, isTestnet, apiBaseUrl);
        return nativeBalance.confirmed >= (amount + fee);
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Get balance summary for display
   * @param address - BSV address
   * @param isTestnet - Network type
   * @returns Formatted balance summary
   */
  static async getBalanceSummary(address: string, isTestnet: boolean = false): Promise<string> {
    try {
      const completeBalance = await this.getCompleteBalance(address, isTestnet);
      
      let summary = `Native BSV: ${completeBalance.native.bsv} BSV (${completeBalance.native.total} satoshis)`;
      
      if (completeBalance.tokens.length > 0) {
        summary += `\nTokens:`;
        for (const token of completeBalance.tokens) {
          summary += `\n  ${token.symbol}: ${token.formattedBalance} (${token.balance} raw)`;
        }
      }
      
      return summary;
    } catch (error) {
      return `Error fetching balance: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}
