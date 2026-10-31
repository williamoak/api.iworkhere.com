import type { Request, Response } from 'express';

function text(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

/**
 * GET /v1/auth/oauth/failure
 *
 * Diagnostic landing page for provider and callback failures.  The previous
 * default target was not registered by the route loader, resulting in a
 * misleading `Cannot GET /auth/oauth/failure` response.
 */
export default function GET(req: Request, res: Response): void {
  const error = text(req.query.error || 'oauth_failed');
  const description = text(req.query.error_description || 'The OAuth flow did not complete.');

  res.status(400).type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Google sign-in failed</title></head>
  <body>
    <h1>Google sign-in failed</h1>
    <p><strong>Error:</strong> ${error}</p>
    <p><strong>Details:</strong> ${description}</p>
    <p>Close this window and try again.</p>
  </body>
</html>`);
}