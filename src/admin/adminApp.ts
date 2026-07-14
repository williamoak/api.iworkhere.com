import express from 'express';
import { resolveAuthContext } from '@services/auth/authContext';
import { resolveUserForApplication } from '@services/auth/authUserResolver';
import { verifyPassword } from '@services/auth/passwordService';
import { issueLoginTokens } from '@services/auth/tokenService';

import { webAuthMiddleware } from "@middleware/webAuthMiddleware";
import { db } from "@services/dbService";
import { users, authTokens } from "@db/schema";
import { eq, desc } from "drizzle-orm";

const router = express.Router();

router.get('/', webAuthMiddleware, async (req: any, res) => {
  if (!req.auth) {
    return res.redirect('/');
  }

  const userId = req.auth.userId;

  const user = await db
    .select({
      username: users.username,
      email: users.email,
      statusCode: users.statusCode,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0]);

  const token = await db
    .select({ createdAt: authTokens.createdAt })
    .from(authTokens)
    .where(eq(authTokens.userId, userId))
    .orderBy(desc(authTokens.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  const sessionStart = token?.createdAt.getTime() || Date.now();

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Dashboard</title>
      <link rel="stylesheet" href="/admin/assets/css/main.css">
    </head>
    <body class="pastel-blue-bg">
    <div class="main-container">
      <div class="panels-container">
        <div class="panel">
            <h3>Status</h3>
            <p>User: ${user.username}</p>
            <p>Email: ${user.email}</p>
            <p>Session Duration: <span id="session-timer">0</span> seconds</p>
            <p>Account Status: Enabled: ${user.statusCode === 'active' ? 'true' : 'false'}, Created: ${user.createdAt.toLocaleDateString()}</p>
            <div class="panel-actions">
                <button title="Account Management">Account</button>
                <button id="logout-btn">Logout</button>
            </div>
        </div>
        <div class="panel">Panel 2</div>
      </div>
      <div class="panel dynamic-panel pastel-yellow-bg">
        Dynamic Panel (Large)
      </div>
    </div>
    <script>
        const sessionStart = ${sessionStart};
        setInterval(() => {
            const seconds = Math.floor((Date.now() - sessionStart) / 1000);
            document.getElementById('session-timer').textContent = seconds;
        }, 1000);

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await fetch('/v1/auth/token', { method: 'DELETE', credentials: 'include' });
            window.location.href = '/';
        });
    </script>
   </body>
    </html>
  `);
});

router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt received for:', req.body.identifier);

    if (!req.body.app_key) {
        req.body.app_key = process.env.APP_KEY || process.env.APP_URL;
    }
    const { app_key, identifier, password } = req.body;

    // 1. Resolve application context
    const appCtx = await resolveAuthContext({ app_key, identifier, password });
    console.log('Application context resolved for:', identifier);

    // 2. Resolve user identity + app access
    const user = await resolveUserForApplication(identifier, appCtx.applicationId);
    console.log('User identity resolved for:', identifier);

    // 3. Verify password
    await verifyPassword(user.userId, password);
    console.log('Password verified for:', identifier);

    // 4. Issue tokens
    const tokens = await issueLoginTokens(user.userId, appCtx.applicationId);
    console.log('Tokens issued for:', identifier);

    // 5. Set cookie and redirect
    res.cookie('auth_token', tokens.access.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: tokens.access.expiresAt.getTime() - Date.now(),
      path: '/',
    });

    res.redirect('/admin');
  } catch (err) {
    console.error('Login attempt failed:', err);
    res.status(401).send('Login failed');
  }
});

export default router;
