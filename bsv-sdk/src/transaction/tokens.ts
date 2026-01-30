import * as bitcoin from 'bitcoinjs-lib';
import { UTXOManager } from './utxo';
import { TransactionBuilder } from './builder';

export interface TokenInfo {
  tokenId: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: number;
  issuer: string;
}

export interface TokenBalance {
  tokenId: string;
  balance: number;
  symbol: string;
  name: string;
  decimals: number;
}

export interface TokenTransfer {
  fromAddress: string;
  toAddress: string;
  tokenId: string;
  amount: number;
  transactionId: string;
  blockHeight?: number;
  confirmations?: number;
}

/**
 * BSV Token Management
 * Supports Sensible Protocol (SEN) tokens and Metanet Protocol
 */
export class TokenManager {
  private static readonly SEN_PROTOCOL_ID = 'SEN';
  private static readonly METANET_PROTOCOL_ID = 'METANET';
  private static readonly DEFAULT_FEE_RATE = 5;

  /**
   * Get token balance for an address
   * @param address - BSV address
   * @param tokenId - Token ID
   * @param isTestnet - Network type
   * @returns Token balance
   */
  static async getTokenBalance(
    address: string,
    tokenId: string,
    isTestnet: boolean = false
  ): Promise<TokenBalance> {
    try {
      // Minimal on-chain scanning (no mocks): fetch recent tx history and sum transfers by simple OP_RETURN detection
      // Note: For production-grade token balances, integrate a Sensible indexer.
      const apiUrl = isTestnet
        ? 'https://api.whatsonchain.com/v1/bsv/test'
        : 'https://api.whatsonchain.com/v1/bsv/main';
      const txsRes = await fetch(`${apiUrl}/address/${address}/txs?limit=200`, { headers: { 'User-Agent': 'BSV-SDK/1.0.0' } } as any);
      if (!txsRes.ok) throw new Error(`txs fetch ${txsRes.status}`);
      const txs = await txsRes.json() as Array<{ tx_hash: string }>;

      let balanceRaw = 0;
      for (const t of txs) {
        const hexRes = await fetch(`${apiUrl}/tx/${t.tx_hash}/hex`, { headers: { 'User-Agent': 'BSV-SDK/1.0.0' } } as any);
        if (!hexRes.ok) continue;
        const hex = (await hexRes.text()).replace(/\"/g, '').trim();
        try {
          const tx = bitcoin.Transaction.fromHex(hex);
          for (const out of tx.outs) {
            const parsed = this.parseTokenData(out.script as Buffer);
            if (parsed && parsed.tokenId === tokenId && parsed.toAddress === address && typeof parsed.amount === 'number') {
              balanceRaw += parsed.amount;
            }
          }
        } catch {}
      }

      return {
        tokenId,
        balance: balanceRaw,
        symbol: 'SEN',
        name: 'Sensible Token',
        decimals: 8
      };
    } catch (error) {
      throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all token balances for an address
   * @param address - BSV address
   * @param isTestnet - Network type
   * @returns Array of token balances
   */
  static async getAllTokenBalances(
    address: string,
    isTestnet: boolean = false
  ): Promise<TokenBalance[]> {
    try {
      // Minimal discovery: scan last N txs and group by tokenId
      const apiUrl = isTestnet
        ? 'https://api.whatsonchain.com/v1/bsv/test'
        : 'https://api.whatsonchain.com/v1/bsv/main';
      const txsRes = await fetch(`${apiUrl}/address/${address}/txs?limit=200`, { headers: { 'User-Agent': 'BSV-SDK/1.0.0' } } as any);
      if (!txsRes.ok) return [];
      const txs = await txsRes.json() as Array<{ tx_hash: string }>;

      const totals = new Map<string, number>();
      for (const t of txs) {
        const hexRes = await fetch(`${apiUrl}/tx/${t.tx_hash}/hex`, { headers: { 'User-Agent': 'BSV-SDK/1.0.0' } } as any);
        if (!hexRes.ok) continue;
        const hex = (await hexRes.text()).replace(/\"/g, '').trim();
        try {
          const tx = bitcoin.Transaction.fromHex(hex);
          for (const out of tx.outs) {
            const parsed = this.parseTokenData(out.script as Buffer);
            if (parsed && parsed.toAddress === address && parsed.tokenId && typeof parsed.amount === 'number') {
              totals.set(parsed.tokenId, (totals.get(parsed.tokenId) || 0) + parsed.amount);
            }
          }
        } catch {}
      }

      return Array.from(totals.entries()).map(([tokenId, balance]) => ({
        tokenId,
        balance,
        symbol: 'SEN',
        name: 'Sensible Token',
        decimals: 8
      }));
    } catch (error) {
      throw new Error(`Failed to get token balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert token amount to human-readable format
   * @param rawAmount - Raw token amount
   * @param decimals - Token decimals
   * @returns Formatted amount string
   */
  static formatTokenAmount(rawAmount: number, decimals: number): string {
    const amount = rawAmount / Math.pow(10, decimals);
    return amount.toFixed(decimals);
  }

  /**
   * Convert human-readable token amount to raw units
   * @param amount - Human-readable amount
   * @param decimals - Token decimals
   * @returns Raw token amount
   */
  static parseTokenAmount(amount: string | number, decimals: number): number {
    const amountNumber = typeof amount === 'string' ? parseFloat(amount) : amount;
    return Math.floor(amountNumber * Math.pow(10, decimals));
  }

  /**
   * Validate token amount
   * @param amount - Token amount (raw or formatted)
   * @param decimals - Token decimals
   * @param isRaw - Whether amount is in raw units
   * @returns Validation result
   */
  static validateTokenAmount(amount: string | number, decimals: number, isRaw: boolean = false): {
    isValid: boolean;
    error?: string;
    rawAmount: number;
    formattedAmount: string;
  } {
    try {
      const amountNumber = typeof amount === 'string' ? parseFloat(amount) : amount;
      
      if (isNaN(amountNumber) || amountNumber < 0) {
        return {
          isValid: false,
          error: 'Invalid token amount',
          rawAmount: 0,
          formattedAmount: '0'
        };
      }

      const rawAmount = isRaw ? amountNumber : this.parseTokenAmount(amountNumber, decimals);
      const formattedAmount = this.formatTokenAmount(rawAmount, decimals);

      if (rawAmount > Number.MAX_SAFE_INTEGER) {
        return {
          isValid: false,
          error: 'Token amount exceeds maximum safe integer',
          rawAmount: 0,
          formattedAmount: '0'
        };
      }

      return {
        isValid: true,
        rawAmount,
        formattedAmount
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Token amount validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rawAmount: 0,
        formattedAmount: '0'
      };
    }
  }

  /**
   * Get token information
   * @param tokenId - Token ID
   * @param isTestnet - Network type
   * @returns Token information
   */
  static async getTokenInfo(tokenId: string, isTestnet: boolean = false): Promise<TokenInfo> {
    try {
      // This would fetch token information from the blockchain
      // or a token registry
      return {
        tokenId,
        symbol: 'SEN',
        name: 'Sensible Token',
        decimals: 8,
        totalSupply: 1000000,
        issuer: 'unknown'
      };
    } catch (error) {
      throw new Error(`Failed to get token info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create token transfer transaction
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param tokenId - Token ID
   * @param amount - Token amount
   * @param privateKey - Private key for signing
   * @param isTestnet - Network type
   * @param feeRate - Fee rate
   * @returns Token transfer transaction
   */
  static async createTokenTransfer(
    fromAddress: string,
    toAddress: string,
    tokenId: string,
    amount: number,
    privateKey: string,
    isTestnet: boolean = false,
    feeRate: number = this.DEFAULT_FEE_RATE
  ): Promise<TokenTransfer> {
    try {
      // Build token transfer transaction (OP_RETURN-based, protocol-specific parsing exists above)
      const builtTransaction = await TransactionBuilder.buildTokenTransaction({
        fromAddress,
        toAddress,
        tokenId,
        amount,
        privateKey,
        isTestnet,
        feeRate
      });

      const transactionId = builtTransaction.transaction.getId();

      return {
        fromAddress,
        toAddress,
        tokenId,
        amount,
        transactionId
      };
    } catch (error) {
      throw new Error(`Failed to create token transfer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse token data from OP_RETURN script
   * @param script - OP_RETURN script
   * @returns Parsed token data
   */
  static parseTokenData(script: Buffer): {
    protocol: string;
    tokenId?: string;
    amount?: number;
    toAddress?: string;
  } | null {
    try {
      // Parse OP_RETURN script for token data
      const scriptChunks = bitcoin.script.decompile(script);
      if (!scriptChunks || scriptChunks.length < 2) {
        return null;
      }

      const opReturnData = scriptChunks[1] as Buffer;
      if (!opReturnData || opReturnData.length < 3) {
        return null;
      }

      // Check protocol identifier
      const protocol = opReturnData.slice(0, 3).toString('utf8');
      if (protocol !== this.SEN_PROTOCOL_ID && protocol !== this.METANET_PROTOCOL_ID) {
        return null;
      }

      // Parse token-specific data
      if (protocol === this.SEN_PROTOCOL_ID) {
        return this.parseSENTokenData(opReturnData);
      } else if (protocol === this.METANET_PROTOCOL_ID) {
        return this.parseMetanetData(opReturnData);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse SEN token data
   * @param data - Token data buffer
   * @returns Parsed SEN token data
   */
  private static parseSENTokenData(data: Buffer): {
    protocol: string;
    tokenId?: string;
    amount?: number;
    toAddress?: string;
  } | null {
    try {
      if (data.length < 11) { // Minimum SEN data length
        return null;
      }

      const protocol = data.slice(0, 3).toString('utf8');
      const tokenId = data.slice(3, 11).toString('hex');
      const amount = data.readBigUInt64LE(11);
      const toAddress = data.slice(19).toString('utf8');

      return {
        protocol,
        tokenId,
        amount: Number(amount),
        toAddress
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse Metanet data
   * @param data - Metanet data buffer
   * @returns Parsed Metanet data
   */
  private static parseMetanetData(data: Buffer): {
    protocol: string;
    nodeId?: string;
    parentTxId?: string;
    data?: string;
  } | null {
    try {
      if (data.length < 7) { // Minimum Metanet data length
        return null;
      }

      const protocol = data.slice(0, 7).toString('utf8');
      const nodeId = data.slice(7, 39).toString('hex');
      const parentTxId = data.slice(39, 71).toString('hex');
      const metanetData = data.slice(71).toString('utf8');

      return {
        protocol,
        nodeId,
        parentTxId,
        data: metanetData
      };
    } catch {
      return null;
    }
  }

  /**
   * Create Metanet node transaction
   * @param fromAddress - Source address
   * @param nodeId - Metanet node ID
   * @param parentTxId - Parent transaction ID
   * @param data - Node data
   * @param privateKey - Private key for signing
   * @param isTestnet - Network type
   * @param feeRate - Fee rate
   * @returns Metanet transaction
   */
  static async createMetanetNode(
    fromAddress: string,
    nodeId: string,
    parentTxId: string,
    data: string,
    privateKey: string,
    isTestnet: boolean = false,
    feeRate: number = this.DEFAULT_FEE_RATE
  ): Promise<string> {
    try {
      // Create Metanet OP_RETURN script
      const metanetData = Buffer.concat([
        Buffer.from(this.METANET_PROTOCOL_ID, 'utf8'),
        Buffer.from(nodeId, 'hex'),
        Buffer.from(parentTxId, 'hex'),
        Buffer.from(data, 'utf8')
      ]);

      const metanetScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        metanetData
      ]);

      // Build transaction with Metanet output
      const builtTransaction = await TransactionBuilder.buildTokenTransaction({
        fromAddress,
        toAddress: fromAddress, // Self-send for Metanet
        tokenId: 'metanet',
        amount: 0,
        privateKey,
        isTestnet,
        feeRate
      });

      return builtTransaction.transaction.toHex();
    } catch (error) {
      throw new Error(`Failed to create Metanet node: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate token ID format
   * @param tokenId - Token ID to validate
   * @returns True if valid format
   */
  static validateTokenId(tokenId: string): boolean {
    try {
      // Token ID should be a valid hex string
      return /^[0-9a-fA-F]+$/.test(tokenId) && tokenId.length >= 16;
    } catch {
      return false;
    }
  }

}
