import express from 'express';
import { resolveAuthContext } from '@services/auth/authContext';
import { resolveUserForApplication } from '@services/auth/authUserResolver';
import { verifyPassword } from '@services/auth/passwordService';
import { issueLoginTokens } from '@services/auth/tokenService';

const router = express.Router();

router.get('/', (_req, res) => {
  res.send('Admin Panel');
});

router.post('/login', async (req, res) => {
  try {
    if (!req.body.app_key) {
        req.body.app_key = process.env.APP_URL;
    }
    const { app_key, identifier, password } = req.body;

    // 1. Resolve application context
    const appCtx = await resolveAuthContext({ app_key, identifier, password });

    // 2. Resolve user identity + app access
    const user = await resolveUserForApplication(identifier, appCtx.applicationId);

    // 3. Verify password
    await verifyPassword(user.userId, password);

    // 4. Issue tokens
    const tokens = await issueLoginTokens(user.userId, appCtx.applicationId);

    // 5. Set cookie and redirect
    res.cookie('auth_token', tokens.access.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: tokens.access.expiresAt.getTime() - Date.now(),
    });

    res.redirect('/admin');
  } catch (err) {
    res.status(401).send('Login failed');
  }
});

export default router;
