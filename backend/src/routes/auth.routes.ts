import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { signup, login, me, changePassword, changeEmail } from '../controllers/auth.controller';

const router = Router();

// Açık uçlar
router.post('/signup', signup);
router.post('/login', login);

// Oturum gerektirenler
router.get('/me', authMiddleware, me);
router.put('/password', authMiddleware, changePassword);
router.put('/email', authMiddleware, changeEmail);

export default router;
