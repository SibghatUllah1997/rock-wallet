import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { basicAuth } from '../middleware/auth';

const router = Router();
const userController = new UserController();

router.post('/recovery', basicAuth.authenticate, userController.recoverWallet);

export default router;
