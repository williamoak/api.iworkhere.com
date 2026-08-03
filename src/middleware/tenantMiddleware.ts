import type { Request, Response, NextFunction } from 'express';

export function tenantMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // Extract tenant from subdomain
    // Expected hostnames: tenant.iworkhere.com
    const origin = req.headers.origin || req.headers.referer || '';
    const hostname = origin ? new URL(origin).hostname : req.hostname;
    const parts = hostname.split('.');
        console.log(`[DEBUG] tenantMiddleware: hostname=${hostname}, parts=${JSON.stringify(parts)}`);
    
    // Default to 'public' if not a subdomain
    let tenant = 'public';
    if (parts.length > 2) {
      tenant = parts[0];
    } else if (parts.length === 2 && parts[0] !== 'api' && parts[0] !== 'localhost') {
      tenant = parts[0];
    }
    
    console.log(`[DEBUG] tenantMiddleware: determined tenant=${tenant}`);
    (req as any).tenant = tenant;
    
    next();
  };
}
