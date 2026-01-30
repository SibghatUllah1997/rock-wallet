import { Request, Response } from 'express';
import { BSVService } from '../services/BSVService';
import { TransactionBuilder } from '../../../bsv-sdk/dist/index';

export class FeeController {
  private bsvService: BSVService;

  constructor() {
    // Default to testnet; will be determined by request
    this.bsvService = new BSVService(true);
  }

  /**
   * Get fee estimates endpoint
   * POST /api/v1/wallets/fee-estimates
   * Returns slow, medium, and fast fee rates for the specified network
   */
  getFeeEstimates = async (req: Request, res: Response): Promise<void> => {
    try {
      const { network } = req.body;

      // Validate network
      if (!network || (network !== 'testnet' && network !== 'mainnet')) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_NETWORK_ERROR',
            err_msg: 'network must be "testnet" or "mainnet"'
          }]
        });
        return;
      }

      const isTestnet = network === 'testnet';
      const bsvService = new BSVService(isTestnet);

      // Get dynamic fees from SDK
      try {
        const dynamicFees = await bsvService.getDynamicFees();
        
        // Convert SDK fees to sat/byte format
        // SDK returns: feeRate (base), fastFee, slowFee (already in satoshis for ~250 byte tx)
        // We need to convert back to sat/byte: fee = sat/byte * 250
        // So: sat/byte = fee / 250
        const slowFeeRate = Math.max(1, Math.floor(dynamicFees.slowFee / 250));
        const mediumFeeRate = dynamicFees.feeRate;
        const fastFeeRate = Math.ceil(dynamicFees.fastFee / 250);

        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'fee estimates retrieved successfully',
          data: {
            slow: slowFeeRate,
            medium: mediumFeeRate,
            fast: fastFeeRate,
            timestamp: dynamicFees.timestamp,
            source: 'dynamic-calculation',
            network: network
          }
        });
      } catch (error) {
        // Fallback to default fees if SDK fails
        console.warn('Error getting dynamic fees, using defaults:', error);
        const defaultFees = isTestnet 
          ? { slow: 1, medium: 3, fast: 5 }
          : { slow: 5, medium: 10, fast: 20 };

        res.status(200).json({
          result: 'success',
          code: 'RW_SUCCESS',
          msg: 'fee estimates retrieved successfully',
          data: {
            slow: defaultFees.slow,
            medium: defaultFees.medium,
            fast: defaultFees.fast,
            timestamp: Date.now(),
            source: 'fallback-default',
            network: network
          }
        });
      }

    } catch (error) {
      console.error('Error getting fee estimates:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'FEE_ESTIMATION_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };

  /**
   * Get fee recommendation endpoint
   * POST /api/v1/wallets/fee-recommendation
   * Returns recommended fee rate and estimated total fee for a given amount
   */
  getFeeRecommendation = async (req: Request, res: Response): Promise<void> => {
    try {
      const { amount, network } = req.body;

      // Validate required fields
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_AMOUNT_ERROR',
            err_msg: 'amount must be a positive number'
          }]
        });
        return;
      }

      if (!network || (network !== 'testnet' && network !== 'mainnet')) {
        res.status(400).json({
          result: 'error',
          code: 'VALIDATION_ERROR',
          msg: 'validation error',
          errors: [{
            code: 'INVALID_NETWORK_ERROR',
            err_msg: 'network must be "testnet" or "mainnet"'
          }]
        });
        return;
      }

      const isTestnet = network === 'testnet';
      const bsvService = new BSVService(isTestnet);

      // Get fee estimates
      let slowFeeRate = 1;
      let mediumFeeRate = 3;
      let fastFeeRate = 5;
      let timestamp = Date.now();
      let source = 'fallback-default';

      try {
        const dynamicFees = await bsvService.getDynamicFees();
        slowFeeRate = Math.max(1, Math.floor(dynamicFees.slowFee / 250));
        mediumFeeRate = dynamicFees.feeRate;
        fastFeeRate = Math.ceil(dynamicFees.fastFee / 250);
        timestamp = dynamicFees.timestamp;
        source = 'dynamic-calculation';
      } catch (error) {
        console.warn('Error getting dynamic fees, using defaults:', error);
        if (!isTestnet) {
          slowFeeRate = 5;
          mediumFeeRate = 10;
          fastFeeRate = 20;
        }
      }

      // Recommend fee tier based on amount
      // For small amounts (< 100k satoshis), use slow
      // For medium amounts (100k - 1M), use medium (default)
      // For large amounts (> 1M), use fast
      let recommendedFeeRate = mediumFeeRate;
      let feeTier = 'medium';

      if (amount < 100000) {
        recommendedFeeRate = slowFeeRate;
        feeTier = 'slow';
      } else if (amount > 1000000) {
        recommendedFeeRate = fastFeeRate;
        feeTier = 'fast';
      }

      // Estimate transaction size and calculate total fee
      // Typical transaction: 1 input, 2 outputs (recipient + change)
      const typicalInputCount = 1;
      const typicalOutputCount = 2;
      const estimatedTotalFee = TransactionBuilder.estimateFee(
        typicalInputCount,
        typicalOutputCount,
        recommendedFeeRate
      );

      res.status(200).json({
        result: 'success',
        code: 'RW_SUCCESS',
        msg: 'fee recommendation retrieved successfully',
        data: {
          amount: amount,
          recommendedFeeRate: recommendedFeeRate,
          feeTier: feeTier,
          estimatedTotalFee: estimatedTotalFee,
          availableFees: {
            slow: slowFeeRate,
            medium: mediumFeeRate,
            fast: fastFeeRate,
            timestamp: timestamp,
            source: source,
            network: network
          }
        }
      });

    } catch (error) {
      console.error('Error getting fee recommendation:', error);
      res.status(500).json({
        result: 'error',
        code: 'INTERNAL_ERROR',
        msg: 'internal server error',
        errors: [{
          code: 'FEE_RECOMMENDATION_ERROR',
          err_msg: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  };
}

