import type { Request, Response, NextFunction } from 'express';

export function tenantMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // Extract tenant from subdomain
    // Expected hostnames: tenant.iworkhere.com
    const hostname = req.hostname;
    const parts = hostname.split('.');
        console.log(`[DEBUG] tenantMiddleware: hostname=${hostname}, parts=${JSON.stringify(parts)}`);
    
    // Default to 'public' if not a subdomain
    let tenant = 'public';
    if (parts.length > 2) {
      tenant = parts[0];
    } else if (parts.length === 2 && parts[0] !== 'api') {
      // Handle domain.com as tenant domain?
      // Or if the base domain is different.
      // For now, assume subdomain is the tenant
      tenant = parts[0];
    }
    
    console.log(`[DEBUG] tenantMiddleware: determined tenant=${tenant}`);
    (req as any).tenant = tenant;
    
    next();
  };
}
