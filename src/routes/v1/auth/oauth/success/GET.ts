import type { Request, Response } from 'express';

/**
 * GET /v1/auth/oauth/success
 *
 * Stable success landing page for OAuth clients that do not use the popup
 * handoff rendered by the Google callback itself.
 */
export default function GET(_req: Request, res: Response): void {
  res.status(200).type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Sign-in successful</title></head>
  <body>
    <h1>Sign-in successful</h1>
    <p>You may close this window.</p>
  </body>
</html>`);
}