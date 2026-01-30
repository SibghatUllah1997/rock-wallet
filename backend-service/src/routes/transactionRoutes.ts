import { Router } from 'express';
import { TransactionController } from '../controllers/TransactionController';

const router = Router();
const transactionController = new TransactionController();

router.post('/:wallet_id/transactions/sign', transactionController.signTransaction);

router.post('/:wallet_id/transactions/sign-token', transactionController.signTokenTransaction);

router.post('/:wallet_id/transactions/broadcast', transactionController.broadcastTransaction);

router.get('/:wallet_id/transactions/sync', transactionController.syncTransactions);

router.get('/:wallet_id/transactions/:tx_id', transactionController.getTransaction);

export default router;
