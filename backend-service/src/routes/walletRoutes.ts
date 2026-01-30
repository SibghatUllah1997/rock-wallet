import { Router } from 'express';
import { WalletController } from '../controllers/WalletController';
import { UserController } from '../controllers/UserController';
import { basicAuth } from '../middleware/auth';

const router = Router();
const walletController = new WalletController();
const userController = new UserController();

router.post('/create', basicAuth.authenticate, walletController.createWallet);

/**
 * @swagger
 * /api/v1/wallets/recovery:
 *   post:
 *     summary: Recover wallet shards
 *     description: |
 *       Recover wallet by regenerating shards from existing shards in database.
 *       
 *       **Flow:**
 *       1. User provides username/email and password for authentication
 *       2. System verifies credentials (same validation as login)
 *       3. System decrypts shard1 and shard2 from database
 *       4. Recovers original mnemonic using 2-of-3 Shamir Secret Sharing (shard1 + shard2)
 *       5. Creates new shards from recovered mnemonic (re-sharding for security rotation)
 *       6. Encrypts all 3 new shards using AES-256-GCM encryption
 *       7. Updates shard1 and shard2 in database (encrypted)
 *       8. Returns encrypted shard3 to client (must be stored securely offline)
 *       
 *       **Security Notes:**
 *       - Requires username/password authentication (same security as login)
 *       - User can only recover their own wallet (enforced by credentials)
 *       - Old shard3 becomes invalid after recovery
 *       - New shard3 must be stored securely by the user
 *       - All shards are encrypted before storage/transmission
 *       - Works even when user is not logged in (lost device/session scenario)
 *     tags: [Wallets]
 *     security:
 *       - basicAuth: []
 *     requestBody:
 *       required: true
 *       description: Username/email and password for authentication
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or email address
 *                 example: "johndoe"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *                 example: "securePassword123"
 *     responses:
 *       200:
 *         description: Wallet recovered successfully. New encrypted shard3 returned.
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
 *                   example: wallet recovered successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                       description: User ID
 *                       example: "0bd38f38-5fa6-4b6b-9283-eab1da4efbab"
 *                     wallet_id:
 *                       type: string
 *                       format: uuid
 *                       description: Wallet ID
 *                       example: "f9f5265f-531c-4b27-b6be-0003df41af6d"
 *                     shard3:
 *                       type: string
 *                       format: base64
 *                       description: New encrypted shard3 (base64 encoded, AES-256-GCM encrypted). Store this securely offline. Old shard3 is now invalid.
 *                       example: "CCAwepboIgucOMQ8KS9tjCBf8mxiNcbVHRnaTSFHEUihgWigiY+Zwz7mgxoQdptnqBhrxoJWGejbFQ9a9CzRKBP0k3kbkMKjsQQ/3Q2oKBjJo5pEvVGP9S8u71WCOm0bZLXYxYSTXLSr7L5mcagIXcH7zxpFDGNN4VPglY1sR7Z2IqHw2KHXrEmB+QbatnULdpptIKCXUyW+MQMcNuCA6d6ADcY1r6bUAAlxppYtG05rMiVaTw8MROv+3ZQCZ+atr26mZOShGh4fk6snhTEefWQ0Os/7fpflgK6gqHHXbUZzuU="
 *                     xpub:
 *                       type: string
 *                       description: Extended public key for the wallet
 *                       example: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxVu4WplDgxgXUf7jJJZ6p6d5X3qQvK5zJZ8Z5Z5Z5Z"
 *                     network:
 *                       type: string
 *                       enum: [testnet, mainnet]
 *                       description: Network type (testnet or mainnet)
 *                       example: "mainnet"
 *             examples:
 *               success:
 *                 summary: Successful recovery
 *                 value:
 *                   result: "success"
 *                   code: "RW_SUCCESS"
 *                   msg: "wallet recovered successfully"
 *                   data:
 *                     user_id: "0bd38f38-5fa6-4b6b-9283-eab1da4efbab"
 *                     wallet_id: "f9f5265f-531c-4b27-b6be-0003df41af6d"
 *                     shard3: "CCAwepboIgucOMQ8KS9tjCBf8mxiNcbVHRnaTSFHEUihgWigiY+Zwz7mgxoQdptnqBhrxoJWGejbFQ9a9CzRKBP0k3kbkMKjsQQ/3Q2oKBjJo5pEvVGP9S8u71WCOm0bZLXYxYSTXLSr7L5mcagIXcH7zxpFDGNN4VPglY1sR7Z2IqHw2KHXrEmB+QbatnULdpptIKCXUyW+MQMcNuCA6d6ADcY1r6bUAAlxppYtG05rMiVaTw8MROv+3ZQCZ+atr26mZOShGh4fk6snhTEefWQ0Os/7fpflgK6gqHHXbUZzuU="
 *                     xpub: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxVu4WplDgxgXUf7jJJZ6p6d5X3qQvK5zJZ8Z5Z5Z5Z"
 *                     network: "mainnet"
 *       400:
 *         description: Validation error
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               result: "error"
 *               code: "INVALID_CREDENTIALS"
 *               msg: "invalid credentials"
 *               errors:
 *                 - code: "INVALID_CREDENTIALS_ERROR"
 *                   err_msg: "Username or password is incorrect"
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */
router.post('/recovery', basicAuth.authenticate, userController.recoverWallet);

router.get('/:wallet_id', basicAuth.authenticate, walletController.getWallet);

// Account creation disabled - accounts are created automatically during user creation
// router.post('/:wallet_id/accounts/create', basicAuth.authenticate, (req, res) => {
//   res.status(400).json({ result: 'error', code: 'NOT_SUPPORTED', msg: 'account creation is handled during user creation' });
// });

router.get('/:wallet_id/accounts', basicAuth.authenticate, walletController.getAccounts);

router.get('/:wallet_id/portfolios', basicAuth.authenticate, walletController.getPortfolios);

// Account creation disabled
// router.post('/:wallet_id/accounts/create-currency', basicAuth.authenticate, (req, res) => {
//   res.status(400).json({ result: 'error', code: 'NOT_SUPPORTED', msg: 'account creation is handled during user creation' });
// });

// Disabled - use GET /:wallet_id/accounts instead
// router.get('/:wallet_id/accounts/by-currency', basicAuth.authenticate, (req, res) => {
//   res.status(400).json({ result: 'error', code: 'NOT_SUPPORTED', msg: 'use GET /:wallet_id/accounts instead' });
// });

router.put('/:wallet_id/accounts/:account_id/name', basicAuth.authenticate, walletController.updateAccountName);

router.get('/:wallet_id/accounts/:account_id', basicAuth.authenticate, walletController.getAccountDetails);

export default router;
