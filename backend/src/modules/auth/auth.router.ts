import { Router } from 'express';
import { signup, login, getMe, logout } from './auth.controller';
import { requireAuth } from '../../middleware/requireAuth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post('/signup', asyncHandler(signup));
router.post('/login', asyncHandler(login));
router.post('/logout', requireAuth, asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(getMe));

export default router;
