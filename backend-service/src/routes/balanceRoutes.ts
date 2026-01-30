import { Router } from 'express';
import { BalanceController } from '../controllers/BalanceController';

const router = Router();
const balanceController = new BalanceController();

router.post('/:wallet_id/balance/sync', balanceController.syncBalance);

router.get('/:wallet_id/balance', balanceController.getBalance);

router.get('/:wallet_id/balance/summary', balanceController.getBalanceSummary);

export default router;
