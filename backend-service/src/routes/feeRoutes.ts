import { Router } from 'express';
import { FeeController } from '../controllers/FeeController';

const router = Router();
const feeController = new FeeController();

/**
 * @swagger
 * /api/v1/users/fee-estimates:
 *   post:
 *     summary: Get fee estimates for network
 *     description: |
 *       Returns slow, medium, and fast fee rates (in satoshis per byte) for the specified network.
 *       The fee rates are calculated dynamically based on current network conditions.
 *       - **slow**: Lower fee rate for transactions that can wait longer for confirmation
 *       - **medium**: Standard fee rate for typical transactions (recommended for most cases)
 *       - **fast**: Higher fee rate for urgent transactions requiring faster confirmation
 *     tags: [Network]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - network
 *             properties:
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *                 description: Blockchain network type
 *                 example: testnet
 *     responses:
 *       200:
 *         description: Fee estimates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: string
 *                   example: success
 *                 code:
 *                   type: string
 *                   example: RW_SUCCESS
 *                 msg:
 *                   type: string
 *                   example: fee estimates retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     slow:
 *                       type: number
 *                       description: Slow fee rate in satoshis per byte
 *                       example: 1
 *                     medium:
 *                       type: number
 *                       description: Medium fee rate in satoshis per byte (recommended)
 *                       example: 3
 *                     fast:
 *                       type: number
 *                       description: Fast fee rate in satoshis per byte
 *                       example: 5
 *                     timestamp:
 *                       type: number
 *                       description: Unix timestamp when fees were calculated
 *                       example: 1761223114938
 *                     source:
 *                       type: string
 *                       description: Source of fee calculation
 *                       enum: [dynamic-calculation, fallback-default]
 *                       example: dynamic-calculation
 *                     network:
 *                       type: string
 *                       enum: [testnet, mainnet]
 *                       example: testnet
 *       400:
 *         description: Validation error
 *         $ref: '#/components/responses/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/fee-estimates', feeController.getFeeEstimates);

/**
 * @swagger
 * /api/v1/users/fee-recommendation:
 *   post:
 *     summary: Get fee recommendation for transaction amount
 *     description: |
 *       Returns recommended fee rate and estimated total fee for a given transaction amount.
 *       The recommendation is based on:
 *       - Transaction amount (larger amounts may use faster fee tiers)
 *       - Current network conditions
 *       - Typical transaction size (1 input, 2 outputs)
 *       
 *       **Fee Tier Selection:**
 *       - Amount < 100,000 satoshis: Uses "slow" fee tier
 *       - Amount 100,000 - 1,000,000 satoshis: Uses "medium" fee tier (default)
 *       - Amount > 1,000,000 satoshis: Uses "fast" fee tier
 *     tags: [Network]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - network
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Transaction amount in satoshis
 *                 minimum: 1
 *                 example: 10000
 *               network:
 *                 type: string
 *                 enum: [testnet, mainnet]
 *                 description: Blockchain network type
 *                 example: testnet
 *     responses:
 *       200:
 *         description: Fee recommendation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: string
 *                   example: success
 *                 code:
 *                   type: string
 *                   example: RW_SUCCESS
 *                 msg:
 *                   type: string
 *                   example: fee recommendation retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: number
 *                       description: Original transaction amount in satoshis
 *                       example: 10000
 *                     recommendedFeeRate:
 *                       type: number
 *                       description: Recommended fee rate in satoshis per byte
 *                       example: 3
 *                     feeTier:
 *                       type: string
 *                       enum: [slow, medium, fast]
 *                       description: Recommended fee tier based on amount
 *                       example: medium
 *                     estimatedTotalFee:
 *                       type: number
 *                       description: Estimated total transaction fee in satoshis (for typical 1 input, 2 output transaction)
 *                       example: 750
 *                     availableFees:
 *                       type: object
 *                       description: All available fee options
 *                       properties:
 *                         slow:
 *                           type: number
 *                           example: 1
 *                         medium:
 *                           type: number
 *                           example: 3
 *                         fast:
 *                           type: number
 *                           example: 5
 *                         timestamp:
 *                           type: number
 *                           example: 1761223114938
 *                         source:
 *                           type: string
 *                           enum: [dynamic-calculation, fallback-default]
 *                           example: dynamic-calculation
 *                         network:
 *                           type: string
 *                           enum: [testnet, mainnet]
 *                           example: testnet
 *       400:
 *         description: Validation error
 *         $ref: '#/components/responses/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/fee-recommendation', feeController.getFeeRecommendation);

export default router;

