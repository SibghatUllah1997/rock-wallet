import { Router } from 'express';
import { AddressController } from '../controllers/AddressController';

const router = Router();
const addressController = new AddressController();

router.post('/:wallet_id/addresses/create', addressController.createAddress);

router.post('/:wallet_id/addresses/generate-batch', addressController.generateBatchAddresses);

router.get('/:wallet_id/addresses', addressController.getAddresses);

router.get('/:wallet_id/addresses/:address_id', addressController.getAddress);

export default router;
