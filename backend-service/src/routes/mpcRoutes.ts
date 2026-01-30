import { Router } from 'express';
import { MpcWalletController } from '../controllers/MpcWalletController';
import { authenticateMpcBearer } from '../middleware/mpcAuth';
import { validateMpcHeaders } from '../middleware/mpcHeaders';

const router = Router();
const mpcWalletController = new MpcWalletController();

/**
 * @swagger
 * /rwcore/api/v1/mpc/wallets/create:
 *   post:
 *     summary: Create wallet (MPC)
 *     description: |
 *       Generates a wallet using Shamir Secret Sharing (2-of-3) and returns wallet key material that aligns with MPC consumer requirements.
 *     tags: [MPC Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-RW-Device-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Client-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Request-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Session-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Correlation-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Proto
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Port
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-Forwarded-For
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: User-Agent
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Content-Type
 *         schema:
 *           type: string
 *           default: application/json
 *         required: true
 *       - in: header
 *         name: Connection
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Accept
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Host
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Date
*         schema:
*           type: string
*           description: HTTP-date (e.g. Tue, 25 Nov 2025 12:00:00 GMT)
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wallet_id
 *             properties:
 *               wallet_id:
 *                 type: string
 *                 description: Client-provided wallet identifier
 *             example:
 *               wallet_id: "44e1d20b-70b7-42c8-a6a4-ef8e9bc667af"
 *     responses:
 *       200:
 *         description: Wallet created successfully
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
 *                   example: account xpub generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet_id:
 *                       type: string
 *                     wallet_key:
 *                       type: string
 *                     xpub_hash:
 *                       type: string
*       400:
*         description: Validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_FIELD_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet_id field is required
*       401:
*         description: Unauthorized access
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: UNAUTHORIZED_ACCESS_ERROR
*                 msg:
*                   type: string
*                   example: unauthorized access error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: INVALID_TOKEN_ERROR
*                       err_msg:
*                         type: string
*                         example: access token is invalid or expired
*       404:
*         description: Wallet not found
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: WALLET_NOT_FOUND
*                 msg:
*                   type: string
*                   example: wallet not found
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: WALLET_NOT_FOUND_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet not found
*       412:
*         description: Header validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: HEADER_VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: header validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_HEADER_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: X-RW-Device-ID header is required
*       500:
*         description: Database error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: DB_ERROR
*                 msg:
*                   type: string
*                   example: database error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: DB_CONN_ERROR
*                       err_msg:
*                         type: string
*                         example: unable to connect to database
 */
router.post(
  '/wallets/create',
  authenticateMpcBearer,
  validateMpcHeaders,
  mpcWalletController.createWallet
);

/**
 * @swagger
 * /rwcore/api/v1/mpc/wallets/recovery:
 *   post:
 *     summary: Recover wallet (MPC)
 *     description: |
 *       Validates wallet identity via wallet_id and xpub_hash, regenerates shards, and returns the refreshed wallet key (shard 3).
 *     tags: [MPC Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-RW-Device-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Client-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Request-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Session-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Correlation-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Proto
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Port
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-Forwarded-For
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: User-Agent
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Content-Type
 *         schema:
 *           type: string
 *           default: application/json
 *         required: true
 *       - in: header
 *         name: Connection
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Accept
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Host
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Date
 *         schema:
 *           type: string
*           description: HTTP-date (e.g. Tue, 25 Nov 2025 12:00:00 GMT)
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wallet_id
 *               - xpub_hash
 *             properties:
 *               wallet_id:
 *                 type: string
 *                 description: Wallet identifier
 *               xpub_hash:
 *                 type: string
 *                 description: SHA-256 hash of the wallet xpub
 *             example:
 *               wallet_id: "44e1d20b-70b7-42c8-a6a4-ef8e9bc667af"
 *               xpub_hash: "2a62ca20f40d9905d081deba9d9123106492e5c55050afa4fc736eb864f7252e"
 *     responses:
 *       200:
 *         description: Wallet recovered successfully
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
 *                   example: account xpub generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet_id:
 *                       type: string
 *                     wallet_key:
 *                       type: string
*       400:
*         description: Validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_FIELD_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet_id field is required
*       401:
*         description: Unauthorized access
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: UNAUTHORIZED_ACCESS_ERROR
*                 msg:
*                   type: string
*                   example: unauthorized access error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: INVALID_TOKEN_ERROR
*                       err_msg:
*                         type: string
*                         example: access token is invalid or expired
*       404:
*         description: Wallet not found
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: WALLET_NOT_FOUND
*                 msg:
*                   type: string
*                   example: wallet not found
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: WALLET_NOT_FOUND_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet not found
*       412:
*         description: Header validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: HEADER_VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: header validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_HEADER_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: X-RW-Device-ID header is required
*       500:
*         description: Database error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: DB_ERROR
*                 msg:
*                   type: string
*                   example: database error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: DB_CONN_ERROR
*                       err_msg:
*                         type: string
*                         example: unable to connect to database
 */
router.post(
  '/wallets/recovery',
  authenticateMpcBearer,
  validateMpcHeaders,
  mpcWalletController.recoverWallet
);

/**
 * @swagger
 * /rwcore/api/v1/mpc/wallets/{wallet_id}/accounts/xpub:
 *   post:
 *     summary: Generate account xpubs (MPC)
 *     description: |
 *       Uses wallet shards plus the provided wallet_key (shard 3) to recover the mnemonic and derive xpubs for the requested account paths.
 *     tags: [MPC Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallet_id
 *         schema:
 *           type: string
 *         required: true
 *         description: Wallet identifier created during wallet creation
 *       - in: header
 *         name: X-RW-Device-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Client-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Request-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Session-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Correlation-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Proto
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Port
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-Forwarded-For
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: User-Agent
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Content-Type
 *         schema:
 *           type: string
 *           default: application/json
 *         required: true
 *       - in: header
 *         name: Connection
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Accept
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Host
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Date
 *         schema:
 *           type: string
*           description: HTTP-date (e.g. Tue, 25 Nov 2025 12:00:00 GMT)
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wallet_key
 *               - accounts
 *             properties:
 *               wallet_key:
 *                 type: string
 *                 description: Shard 3 provided by client
 *               accounts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - account_id
 *                     - path
 *                   properties:
 *                     account_id:
 *                       type: string
 *                       description: External identifier for the account
 *                     path:
 *                       type: string
 *                       description: Full BIP44 account path (e.g. m/44'/236'/0')
 *           example:
 *             wallet_key: "803b3e2abce5e856945b9b5ff08c0ceb4f12..."
 *             accounts:
 *               - account_id: "8d022687-2a29-40ec-bd17-6831e495e6f5"
 *                 path: "m/44'/236'/0'"
 *               - account_id: "52e1d20b-70b7-42c8-a6a4-ef8e9bc667af"
 *                 path: "m/44'/0'/0'"
 *     responses:
 *       200:
 *         description: Account xpubs generated successfully
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
 *                   example: account xpub generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     accounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           account_id:
 *                             type: string
 *                           path:
 *                             type: string
 *                           xpub:
 *                             type: string
*       400:
*         description: Validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_FIELD_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet_key field is required
*       401:
*         description: Unauthorized access
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: UNAUTHORIZED_ACCESS_ERROR
*                 msg:
*                   type: string
*                   example: unauthorized access error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: INVALID_TOKEN_ERROR
*                       err_msg:
*                         type: string
*                         example: access token is invalid or expired
*       404:
*         description: Wallet not found
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: WALLET_NOT_FOUND
*                 msg:
*                   type: string
*                   example: wallet not found
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: WALLET_NOT_FOUND_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet not found
*       412:
*         description: Header validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: HEADER_VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: header validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_HEADER_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: X-RW-Device-ID header is required
*       500:
*         description: Database error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: DB_ERROR
*                 msg:
*                   type: string
*                   example: database error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: DB_CONN_ERROR
*                       err_msg:
*                         type: string
*                         example: unable to connect to database
 */
router.post(
  '/wallets/:wallet_id/accounts/xpub',
  authenticateMpcBearer,
  validateMpcHeaders,
  mpcWalletController.generateAccountXpubs
);

/**
 * @swagger
 * /rwcore/api/v1/mpc/wallets/{wallet_id}/transactions/sign:
 *   post:
 *     summary: Sign transaction (MPC - UTXO-based and Account-based)
 *     description: |
 *       Recovers mnemonic using wallet shards, derives keys per provided HD paths, and signs the supplied unsigned transaction.
 *       Supports both UTXO-based blockchains (BSV, BTC) and ACCOUNT_BASED blockchains (Ethereum, EVM-compatible).
 *       For UTXO_BASED: requires utxos array with transaction input metadata.
 *       For ACCOUNT_BASED: requires account_chain_details with address, address_path, and chain_id.
 *     tags: [MPC Wallets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallet_id
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Device-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Client-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Request-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Session-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Correlation-ID
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Proto
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-RW-Forwarded-Port
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: X-Forwarded-For
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: User-Agent
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Content-Type
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Connection
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Accept
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Host
 *         schema:
 *           type: string
 *         required: true
 *       - in: header
 *         name: Date
 *         schema:
 *           type: string
*           description: HTTP-date (e.g. Tue, 25 Nov 2025 12:00:00 GMT)
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tx_id
 *               - tx_data
 *               - wallet_key
 *               - blockchain_type
 *               - network_fee
 *               - account_path
 *             properties:
 *               tx_id:
 *                 type: string
 *                 description: Internal transaction identifier
 *               tx_data:
 *                 type: string
 *                 description: |
 *                   Unsigned transaction hex (for both UTXO_BASED and ACCOUNT_BASED). 
 *                   Per requirements, must always be a string (hex format).
 *                   For UTXO_BASED: Raw transaction hex (e.g., "0100000001...")
 *                   For ACCOUNT_BASED: RLP-encoded unsigned transaction hex (e.g., "0x01ea01808504a817c80082520894...")
 *                   For ACCOUNT_BASED, generate the hex client-side using ethers.js:
 *                   const tx = { to: '0x...', value: BigInt('0x...'), nonce: 0, gasPrice: BigInt('0x...'), gasLimit: BigInt('0x5208'), chainId: 1 };
 *                   const unsignedTx = ethers.Transaction.from(tx);
 *                   const hex = unsignedTx.unsignedSerialized;
 *               wallet_key:
 *                 type: string
 *                 description: Shard 3 provided by client
 *               blockchain_type:
 *                 type: string
 *                 enum: [UTXO_BASED, ACCOUNT_BASED]
 *               network_fee:
 *                 type: number
 *                 description: Fee rate (sats per byte for UTXO_BASED, gas price for ACCOUNT_BASED)
 *               account_path:
 *                 type: string
 *                 description: Full account-level BIP44 path (e.g. m/44'/236'/0' for BSV, m/44'/60'/0' for Ethereum)
 *               utxos:
 *                 type: array
 *                 description: UTXO metadata matching transaction inputs (required for UTXO_BASED, not used for ACCOUNT_BASED)
 *                 items:
 *                   type: object
 *                   required:
 *                     - tx_hash
 *                     - vout
 *                     - script_pub_key_hex
 *                     - value
 *                     - address_path
 *                   properties:
 *                     tx_hash:
 *                       type: string
 *                     vout:
 *                       type: integer
 *                     script_pub_key_hex:
 *                       type: string
 *                     value:
 *                       type: number
 *                     address_path:
 *                       type: string
 *                       description: Relative path after account path (e.g. 0/0)
 *               account_chain_details:
 *                 type: object
 *                 description: Account chain details (required for ACCOUNT_BASED, not used for UTXO_BASED)
 *                 required:
 *                   - address
 *                   - address_path
 *                   - chain_id
 *                 properties:
 *                   address:
 *                     type: string
 *                     description: Ethereum address (must match derived address, must be 42 characters: 0x + 40 hex digits)
 *                     example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bE0"
 *                   address_path:
 *                     type: string
 *                     description: Address path after account (e.g. 0/0)
 *                     example: "0/0"
 *                   chain_id:
 *                     type: integer
 *                     description: Chain ID (1=Ethereum Mainnet, 5=Goerli, 11155111=Sepolia, etc.)
 *                     example: 1
 *           examples:
 *             utxo_based:
 *               summary: UTXO-based transaction example
 *               value:
 *                 tx_id: "internal-tx-123"
 *                 tx_data: "0100000001..."
 *                 wallet_key: "803c691baf9a..."
 *                 blockchain_type: "UTXO_BASED"
 *                 network_fee: 5
 *                 account_path: "m/44'/236'/0'"
 *                 utxos:
 *                   - tx_hash: "b6f0..."
 *                     vout: 0
 *                     script_pub_key_hex: "76a914..."
 *                     value: 10000
 *                     address_path: "0/0"
 *             account_based:
 *               summary: Account-based transaction example
 *               value:
 *                 tx_id: "internal-tx-456"
 *                 tx_data: '{"to":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bE0","value":"0x2386f26fc10000","nonce":0,"gasPrice":"0x4a817c800","gasLimit":"0x5208","chainId":1}'
 *                 wallet_key: "803c691baf9a..."
 *                 blockchain_type: "ACCOUNT_BASED"
 *                 network_fee: 20000000000
 *                 account_path: "m/44'/60'/0'"
 *                 account_chain_details:
 *                   address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bE0"
 *                   address_path: "0/0"
 *                   chain_id: 1
 *     responses:
 *       200:
 *         description: Transaction signed successfully
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
 *                   example: transaction signed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tx_id:
 *                       type: string
 *                     tx_data:
 *                       type: string
 *                       description: Signed transaction hex
 *       400:
*         description: Validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_FIELD_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: tx_id field is required
 *       401:
*         description: Unauthorized access
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: UNAUTHORIZED_ACCESS_ERROR
*                 msg:
*                   type: string
*                   example: unauthorized access error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: INVALID_TOKEN_ERROR
*                       err_msg:
*                         type: string
*                         example: access token is invalid or expired
 *       404:
*         description: Wallet not found
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: WALLET_NOT_FOUND
*                 msg:
*                   type: string
*                   example: wallet not found
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: WALLET_NOT_FOUND_ERROR
*                       err_msg:
*                         type: string
*                         example: wallet not found
 *       412:
*         description: Header validation error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: HEADER_VALIDATION_ERROR
*                 msg:
*                   type: string
*                   example: header validation error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: REQUIRED_HEADER_MISSING_ERROR
*                       err_msg:
*                         type: string
*                         example: X-RW-Device-ID header is required
 *       500:
*         description: Database or signing error
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 result:
*                   type: string
*                   example: error
*                 code:
*                   type: string
*                   example: DB_ERROR
*                 msg:
*                   type: string
*                   example: database error
*                 errors:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       code:
*                         type: string
*                         example: DB_CONN_ERROR
*                       err_msg:
*                         type: string
*                         example: unable to connect to database
 */
router.post(
  '/wallets/:wallet_id/transactions/sign',
  authenticateMpcBearer,
  validateMpcHeaders,
  mpcWalletController.signTransaction
);

export default router;

