import axios from 'axios';
import { PrivateKey, P2PKH, Transaction as BsvTransaction } from '@bsv/sdk';
import { UTXOManager } from './utxo';

export interface TransactionInput {
  txid: string;
  vout: number;
  value: number;
}

export interface TransactionOutput {
  address: string;
  value: number;
}

export interface TransactionParams {
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  feeRate?: number;
  changeAddress?: string;
}

export interface BuiltTransaction {
  transactionHex: string;
  transactionId: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  fee: number;
  change: number;
}

/**
 * BSV Transaction Builder using native bsv library
 * Native BSV transactions only
 */
export class TransactionBuilder {
  private static readonly DEFAULT_FEE_RATE = 5; // satoshis per byte
  private static readonly DUST_LIMIT = 546; // BSV dust limit

  /**
   * Build a native BSV transaction
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param amount - Amount in satoshis
   * @param privateKey - Private key for signing (WIF format)
   * @param isTestnet - Network type
   * @param feeRate - Fee rate (optional)
   * @returns Built transaction
   */
  static async buildNativeTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    isTestnet: boolean = false,
    feeRate: number = this.DEFAULT_FEE_RATE,
    rpcBaseUrl?: string
  ): Promise<BuiltTransaction> {
    // Validate inputs
    this.validateTransactionInputs(fromAddress, toAddress, amount);

    // Get UTXOs for source address
    const utxos = await UTXOManager.getUTXOs(fromAddress, isTestnet, rpcBaseUrl);
    if (utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${fromAddress}`);
    }

    // Select optimal UTXOs
    const selection = UTXOManager.selectOptimalUTXOs(utxos, amount, feeRate);

    // Build transaction inputs
    const inputs: TransactionInput[] = selection.selectedUtxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value ?? utxo.satoshis
    }));

    // Build transaction outputs
    const outputs: TransactionOutput[] = [
      {
        address: toAddress,
        value: amount
      }
    ];

    // Calculate total input value
    const totalInputValue = selection.selectedUtxos.reduce((sum, utxo) => sum + (utxo.value ?? utxo.satoshis), 0);
    
    // Add change output if needed
    const change = totalInputValue - amount - selection.fee;
    if (change > 0) {
      outputs.push({
        address: fromAddress,
        value: change
      });
    }

    // ------ Build using @bsv/sdk (native) ------
    const isTest = isTestnet;
    const wocBase = (rpcBaseUrl && rpcBaseUrl.length > 0)
      ? rpcBaseUrl
      : (isTest ? 'https://api.whatsonchain.com/v1/bsv/test' : 'https://api.whatsonchain.com/v1/bsv/main');

    const fetchPrevTxHex = async (txid: string): Promise<string> => {
      const url = `${wocBase}/tx/${txid}/hex`;
      const { data } = await axios.get(url, { timeout: 10000, responseType: 'text' });
      return typeof data === 'string' ? data : String(data);
    };

    const priv = PrivateKey.fromWif(privateKey);

    // Build inputs with full sourceTransaction for @bsv/sdk
    const nativeInputs: any[] = [];
    for (const inp of inputs) {
      const rawHex = await fetchPrevTxHex(inp.txid);
      const sourceTx = BsvTransaction.fromHex(rawHex);

      while (sourceTx.outputs.length <= inp.vout) {
        sourceTx.outputs.push({
          satoshis: 0,
          lockingScript: new P2PKH().lock(fromAddress)
        } as any);
      }
      // Ensure satoshis populated for signing
      sourceTx.outputs[inp.vout].satoshis = inp.value;

      nativeInputs.push({
        sourceTransaction: sourceTx,
        sourceOutputIndex: inp.vout,
        sourceSatoshis: inp.value,
        sequence: 0xffffffff,
        unlockingScriptTemplate: new P2PKH().unlock(priv)
      });
    }

    const nativeOutputs: any[] = [];
    nativeOutputs.push({ lockingScript: new P2PKH().lock(toAddress), satoshis: amount });
    if (change > 0) {
      nativeOutputs.push({ lockingScript: new P2PKH().lock(fromAddress), satoshis: change });
    }

    const tx = new BsvTransaction(1, nativeInputs, nativeOutputs);
    await tx.sign();

    const transactionHex = tx.toHex();
    const transactionId = String(tx.hash('hex'));

    return {
      transactionHex,
      transactionId,
      inputs,
      outputs,
      fee: selection.fee,
      change: change > 0 ? change : 0
    };
  }

  /**
   * Calculate minimum fee for transaction
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate
   * @returns Minimum fee
   */
  private static calculateMinimumFee(inputCount: number, outputCount: number, feeRate: number): number {
    const inputSize = inputCount * 148; // P2PKH input size
    const outputSize = outputCount * 34; // P2PKH output size
    const baseSize = 10; // Base transaction size
    const totalSize = baseSize + inputSize + outputSize;
    return totalSize * feeRate;
  }

  /**
   * Validate transaction inputs
   * @param fromAddress - Source address
   * @param toAddress - Destination address
   * @param amount - Amount
   */
  private static validateTransactionInputs(fromAddress: string, toAddress: string, amount: number): void {
    if (!fromAddress || fromAddress.length === 0) {
      throw new Error('Source address is required');
    }
    if (!toAddress || toAddress.length === 0) {
      throw new Error('Destination address is required');
    }
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (amount < this.DUST_LIMIT) {
      throw new Error(`Amount ${amount} is below dust limit (${this.DUST_LIMIT})`);
    }
    if (fromAddress === toAddress) {
      throw new Error('Source and destination addresses cannot be the same');
    }
  }

  /**
   * Estimate transaction fee
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate
   * @returns Estimated fee
   */
  static estimateFee(inputCount: number, outputCount: number, feeRate: number = this.DEFAULT_FEE_RATE): number {
    return this.calculateMinimumFee(inputCount, outputCount, feeRate);
  }

  /**
   * Validate transaction before building
   * @param params - Transaction parameters
   * @returns True if valid
   */
  static validateTransaction(params: TransactionParams): boolean {
    try {
      if (!params.inputs || params.inputs.length === 0) {
        return false;
      }
      if (!params.outputs || params.outputs.length === 0) {
        return false;
      }
      
      // Validate inputs
      for (const input of params.inputs) {
        if (!input.txid || input.vout < 0 || input.value <= 0) {
          return false;
        }
      }
      
      // Validate outputs
      for (const output of params.outputs) {
        if (!output.address || output.value < 0) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }
}
