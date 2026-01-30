import { ethers } from 'ethers';

export interface EthereumTransactionRequest {
  to: string;
  value: string | bigint; // Hex string or BigInt (in wei)
  nonce: number;
  gasPrice?: string | bigint; // Legacy transactions
  maxFeePerGas?: string | bigint; // EIP-1559 transactions
  maxPriorityFeePerGas?: string | bigint; // EIP-1559 transactions
  gasLimit: string | bigint;
  data?: string; // Contract call data (hex)
  chainId: number;
}

export interface EthereumSigningResult {
  signedTransactionHex: string;
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  chainId: number;
}

/**
 * Ethereum/EVM transaction signing
 * Supports both legacy (gasPrice) and EIP-1559 (maxFeePerGas) transactions
 * 
 * Per requirements: tx_data must be RLP-encoded unsigned transaction hex (string)
 */
export class EthereumTransactionSigner {
  /**
   * Sign Ethereum/EVM-compatible transaction
   * Generic implementation - works with any EVM-compatible blockchain
   * 
   * @param unsignedTx - RLP-encoded unsigned transaction hex (string) or transaction object
   * @param privateKey - Private key in hex format (with or without 0x prefix)
   * @param chainId - Chain ID for the network (any valid EVM chain ID from request)
   * @returns Signed transaction result
   */
  static async signTransaction(
    unsignedTx: EthereumTransactionRequest | string,
    privateKey: string,
    chainId: number
  ): Promise<EthereumSigningResult> {
    try {
      // Ensure private key has 0x prefix
      const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

      // Create wallet from private key
      const wallet = new ethers.Wallet(formattedPrivateKey);

      // Parse transaction - can be RLP-encoded unsigned hex or transaction object
      let txRequest: ethers.TransactionRequest | null = null;
      let txData: EthereumTransactionRequest | null = null;
      
      if (typeof unsignedTx === 'string') {
        // Try to parse as RLP-encoded unsigned transaction hex (per requirements)
        try {
          const parsedTx = ethers.Transaction.from(unsignedTx.trim());
          // Convert parsed transaction to TransactionRequest format for signing
          txRequest = {
            to: parsedTx.to || undefined,
            value: parsedTx.value,
            nonce: parsedTx.nonce,
            gasLimit: parsedTx.gasLimit,
            gasPrice: parsedTx.gasPrice || undefined,
            maxFeePerGas: parsedTx.maxFeePerGas || undefined,
            maxPriorityFeePerGas: parsedTx.maxPriorityFeePerGas || undefined,
            data: parsedTx.data || '0x',
            chainId: parsedTx.chainId || chainId
          };
        } catch (hexError) {
          // If not valid RLP hex, try parsing as JSON (backward compatibility)
          try {
            txData = JSON.parse(unsignedTx.trim()) as EthereumTransactionRequest;
          } catch (jsonError) {
            throw new Error(`Invalid transaction format: must be RLP-encoded unsigned transaction hex or valid JSON. Error: ${hexError instanceof Error ? hexError.message : 'Unknown error'}`);
          }
        }
      } else {
        // Already an object
        txData = unsignedTx as EthereumTransactionRequest;
      }
      
      // If we have txData (from JSON or object), convert to TransactionRequest
      if (txData && !txRequest) {
        // Validate required fields
        if (txData.to === undefined && txData.to === null) {
          throw new Error('Transaction "to" field is required');
        }
        if (txData.value === undefined) {
          throw new Error('Transaction "value" field is required');
        }
        if (txData.nonce === undefined) {
          throw new Error('Transaction "nonce" field is required');
        }
        if (txData.gasPrice === undefined && txData.maxFeePerGas === undefined) {
          throw new Error('Transaction must include either "gasPrice" (legacy) or "maxFeePerGas" (EIP-1559)');
        }
        if (txData.gasLimit === undefined) {
          throw new Error('Transaction "gasLimit" field is required');
        }

        // Set chain ID
        txData.chainId = chainId;

        // Convert value to BigInt if it's a string
        const value = typeof txData.value === 'string' 
          ? BigInt(txData.value.startsWith('0x') ? txData.value : `0x${txData.value}`)
          : BigInt(txData.value);

        // Build transaction request
        txRequest = {
          to: txData.to,
          value: value,
          nonce: txData.nonce,
          gasLimit: typeof txData.gasLimit === 'string'
            ? BigInt(txData.gasLimit.startsWith('0x') ? txData.gasLimit : `0x${txData.gasLimit}`)
            : BigInt(txData.gasLimit),
          data: txData.data || '0x',
          chainId: chainId
        };

        // Handle legacy vs EIP-1559 transactions
        if (txData.gasPrice !== undefined) {
          // Legacy transaction
          txRequest.gasPrice = typeof txData.gasPrice === 'string'
            ? BigInt(txData.gasPrice.startsWith('0x') ? txData.gasPrice : `0x${txData.gasPrice}`)
            : BigInt(txData.gasPrice);
        } else {
          // EIP-1559 transaction
          if (txData.maxFeePerGas === undefined || txData.maxPriorityFeePerGas === undefined) {
            throw new Error('EIP-1559 transactions require both maxFeePerGas and maxPriorityFeePerGas');
          }
          txRequest.maxFeePerGas = typeof txData.maxFeePerGas === 'string'
            ? BigInt(txData.maxFeePerGas.startsWith('0x') ? txData.maxFeePerGas : `0x${txData.maxFeePerGas}`)
            : BigInt(txData.maxFeePerGas);
          txRequest.maxPriorityFeePerGas = typeof txData.maxPriorityFeePerGas === 'string'
            ? BigInt(txData.maxPriorityFeePerGas.startsWith('0x') ? txData.maxPriorityFeePerGas : `0x${txData.maxPriorityFeePerGas}`)
            : BigInt(txData.maxPriorityFeePerGas);
        }
      }

      if (!txRequest) {
        throw new Error('Failed to parse transaction data');
      }

      // Sign transaction
      const signedTx = await wallet.signTransaction(txRequest);

      // Get transaction hash
      const txHash = ethers.Transaction.from(signedTx).hash || '';

      // Get transaction details for response
      const signedTxObj = ethers.Transaction.from(signedTx);

      return {
        signedTransactionHex: signedTx,
        transactionHash: txHash,
        from: wallet.address,
        to: signedTxObj.to || '',
        value: signedTxObj.value.toString(),
        chainId: chainId
      };
    } catch (error) {
      throw new Error(`Failed to sign Ethereum transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
