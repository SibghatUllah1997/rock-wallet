import { Router } from 'express';
import { TransactionController } from '../controllers/TransactionController';
import { BalanceController } from '../controllers/BalanceController';
import { WalletController } from '../controllers/WalletController';
import { AddressController } from '../controllers/AddressController';
import { authenticateJWT } from '../middleware/jwtAuth';

const router = Router();
const transactionController = new TransactionController();
const balanceController = new BalanceController();
const walletController = new WalletController();
const addressController = new AddressController();

/**
 * @swagger
 * /api/v1/users/transactions/sign:
 *   post:
 *     summary: Sign a native BSV transaction (User-based)
 *     description: |
 *       Signs a native BSV transaction using JWT authentication and account_index.
 *       Uses shard1 from database + shard3 from request to recover mnemonic and sign transaction.
 *       account_index: 0 = saving account, 1 = current account
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - account_index
 *               - toAddress
 *               - amount
 *               - shard3
 *             properties:
 *               account_index:
 *                 type: number
 *                 enum: [0, 1]
 *                 description: Account index (0 = saving, 1 = current)
 *                 example: 0
 *               toAddress:
 *                 type: string
 *                 description: Destination BSV address
 *                 example: mqbfhksgzwdj6ZzrAQssZqyn1KdTMae6QJ
 *               amount:
 *                 type: number
 *                 description: Amount in satoshis
 *                 example: 10000
 *               shard3:
 *                 type: string
 *                 description: Third shard from client for 2-of-3 recovery
 *                 example: 80390a45935bf4bf7e38688fb13bFDAEAD20514A5F54A19CECD2FFFD41EB1258E7B70A99AE74462FD8AFECA48413DFC36E6F9E341509AEE8F84B1DF421ED6B4C6EA33E711F1DCAD5728674564022574FD
 *               feeRate:
 *                 type: number
 *                 description: Optional fee rate in satoshis per byte
 *                 example: 5
 *               changeAddress:
 *                 type: string
 *                 description: Optional change address (defaults to fromAddress)
 *                 example: mw9sM8HBn4eWGQyUetx3DQ85p4erZbPNR8
 *     responses:
 *       200:
 *         description: Transaction signed successfully
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/transactions/sign', authenticateJWT, transactionController.signTransactionForUser);

/**
 * @swagger
 * /api/v1/users/transactions/broadcast:
 *   post:
 *     summary: Broadcast a signed transaction (raw hex)
 *     description: Broadcasts a signed transaction hex to the BSV network
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rawTx
 *             properties:
 *               rawTx:
 *                 type: string
 *                 description: Signed transaction in hexadecimal format
 *                 example: "0100000001..."
 *     responses:
 *       200:
 *         description: Transaction broadcast successfully
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/transactions/broadcast', authenticateJWT, transactionController.broadcastTransactionForUser);

/**
 * @swagger
 * /api/v1/users/transactions/sync:
 *   post:
 *     summary: Sync transactions for user (User-based)
 *     description: Syncs transactions from blockchain for authenticated user
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction sync successful
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/transactions/sync', authenticateJWT, transactionController.syncTransactionsForUser);

/**
 * @swagger
 * /api/v1/users/transactions/{tx_id}:
 *   get:
 *     summary: Get transaction information (User-based)
 *     description: Retrieves transaction details for authenticated user
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tx_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction information retrieved successfully
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/transactions/:tx_id', authenticateJWT, transactionController.getTransactionForUser);

/**
 * @swagger
 * /api/v1/users/balance:
 *   post:
 *     summary: Get all account balances for user
 *     description: Returns balances for all accounts (saving and current) associated with the user
 *     tags: [Balance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance information retrieved successfully
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/balance', authenticateJWT, balanceController.getBalanceForUser);

/**
 * @swagger
 * /api/v1/users/portfolios:
 *   post:
 *     summary: Get portfolios for user
 *     description: Returns aggregated balances from all accounts for authenticated user
 *     tags: [Balance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolios retrieved successfully
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/portfolios', authenticateJWT, walletController.getPortfoliosForUser);

/**
 * @swagger
 * /api/v1/users/addresses:
 *   post:
 *     summary: Get all addresses for user
 *     description: Returns all addresses from user's accounts
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses retrieved successfully
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/addresses', authenticateJWT, addressController.getAddressesForUser);

/**
 * @swagger
 * /api/v1/users/accounts/create:
 *   post:
 *     summary: Create a new account for user
 *     description: |
 *       Creates a new account by reading the last created account index from the database
 *       and creating a new account at the next index. The new account is derived from the
 *       user's mnemonic (recovered from shards) and saved in the user's document.
 *       Account types alternate: even indices = saving, odd indices = current.
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Account created successfully
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
 *                   example: RW_CREATED
 *                 msg:
 *                   type: string
 *                   example: account created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     account_id:
 *                       type: string
 *                       description: Unique account identifier
 *                     account_type:
 *                       type: string
 *                       enum: [saving, current]
 *                       description: Account type (alternates based on index)
 *                     account_index:
 *                       type: number
 *                       description: Account index (incremented from last account)
 *                     xpub:
 *                       type: string
 *                       description: Extended public key for the account
 *                     derivation_path:
 *                       type: string
 *                       description: BIP44 derivation path
 *                     address:
 *                       type: object
 *                       properties:
 *                         address:
 *                           type: string
 *                           description: BSV address
 *                         public_key:
 *                           type: string
 *                           description: Public key in hex format
 *                         derivation_path:
 *                           type: string
 *                           description: Address derivation path
 *                         address_index:
 *                           type: number
 *                           description: Address index (0 for first address)
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Account creation timestamp
 *                     total_accounts:
 *                       type: number
 *                       description: Total number of accounts for the user
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/accounts/create', authenticateJWT, walletController.createAccountForUser);

export default router;

