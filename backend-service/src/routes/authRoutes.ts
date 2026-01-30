import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { basicAuth } from '../middleware/auth';

const router = Router();
const userController = new UserController();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user with wallet and accounts
 *     description: |
 *       Creates a new user account with embedded wallet data.
 *       Process:
 *       1. Creates user with username, email, and hashed password
 *       2. Generates random mnemonic using BIP39
 *       3. Creates wallet with xpub and shards (2-of-3 threshold)
 *       4. Creates 2 accounts (saving at index 0, current at index 1)
 *       5. Generates addresses for both accounts with public keys
 *       6. Encrypts and stores shard1 and shard2 in database
 *       7. Returns encrypted shard3 for client to store securely
 *       **Note:** All shards are encrypted before storage/transmission.
 *     tags: [Authentication]
 *     security:
 *       - basicAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Unique username (case-insensitive)
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address (case-insensitive)
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password (will be hashed with bcrypt)
 *                 example: securePassword123
 *               name:
 *                 type: string
 *                 description: Optional user display name
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                   example: user created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     wallet_id:
 *                       type: string
 *                     shard3:
 *                       type: string
 *                       description: Encrypted third shard - MUST be stored securely by client
 *                     xpub:
 *                       type: string
 *                     network:
 *                       type: string
 *                       enum: [testnet, mainnet]
 *                     accounts:
 *                       type: array
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/register', basicAuth.authenticate, userController.createUser);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticates user with username/email and password, returns JWT tokens
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
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
 *                 description: Username or email
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *                 example: securePassword123
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: login successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     wallet_id:
 *                       type: string
 *                     network:
 *                       type: string
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresIn:
 *                       type: number
 *                     tokenType:
 *                       type: string
 *                       example: Bearer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 */
router.post('/login', userController.login);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Revokes refresh token session
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token to revoke
 *     responses:
 *       200:
 *         description: Logout successful
 *       404:
 *         description: Session not found
 */
router.post('/logout', userController.logout);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Refreshes access token using refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', userController.refreshToken);

export default router;

