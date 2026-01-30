import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { basicAuth } from '../middleware/auth';
import { authenticateJWT } from '../middleware/jwtAuth';

const router = Router();
const userController = new UserController();

/**
 * @swagger
 * /api/v1/users/profile:
 *   get:
 *     summary: Get user profile
 *     description: Returns current user's profile (requires JWT)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/profile', authenticateJWT, userController.getProfile);

/**
 * @swagger
 * /api/v1/users/profile:
 *   put:
 *     summary: Update user profile
 *     description: Updates user profile (requires JWT)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/profile', authenticateJWT, userController.updateProfile);

/**
 * @swagger
 * /api/v1/users/change-password:
 *   post:
 *     summary: Change password
 *     description: Changes user password (requires JWT and current password)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Must be at least 8 characters
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/change-password', authenticateJWT, userController.changePassword);

/**
 * @swagger
 * /api/v1/users/sessions:
 *   get:
 *     summary: Get active sessions
 *     description: Returns all active sessions for the user (requires JWT)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/sessions', authenticateJWT, userController.getSessions);

/**
 * @swagger
 * /api/v1/users/stats:
 *   get:
 *     summary: Get user statistics
 *     description: Returns user statistics including session info, account count, etc. (requires JWT)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/stats', authenticateJWT, userController.getUserStats);

/**
 * @swagger
 * /api/v1/users/deactivate:
 *   post:
 *     summary: Deactivate user account
 *     description: Deactivates user account and revokes all sessions (requires JWT and password)
 *     tags: [User Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password for confirmation
 *     responses:
 *       200:
 *         description: Account deactivated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/deactivate', authenticateJWT, userController.deactivateAccount);

// Recovery route moved to /api/v1/wallets/recovery (username/password authentication)

export default router;
