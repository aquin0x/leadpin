import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getUserSettings,
  updateUserSettings,
  testProxy,
} from '../controllers/user-settings.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getUserSettings);
router.put('/', updateUserSettings);
router.post('/proxy/test', testProxy);

export default router;
