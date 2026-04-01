# api.iworkhere.com

TypeScript + Express API service for `https://api.iworkhere.com/v1/*`.

## Operations

### CORS

The API allows browser origins that match:

- `https://*.iworkhere.com`

You can additionally allow explicit origins with:

- `CORS_ALLOWED_ORIGINS` (comma-separated)

Example:

```bash
CORS_ALLOWED_ORIGINS=https://docs.partner.example,https://status.example
```

Notes:

- Exact origin matching is used for `CORS_ALLOWED_ORIGINS`.
- Existing subdomain matching for `*.iworkhere.com` remains enabled.

### CORS Troubleshooting

- Origin includes scheme and host only.
  Use `https://docs.partner.example`, not `docs.partner.example`.
- Do not include paths in `CORS_ALLOWED_ORIGINS`.
  `https://docs.partner.example/path` will not match.
- No wildcard matching is applied inside `CORS_ALLOWED_ORIGINS`.
  Add each external origin explicitly.
- Ports are part of origin matching.
  `https://docs.partner.example:8443` is different from `https://docs.partner.example`.

### Auth Debug Flags

Auth-related debug flags are intended for temporary diagnostics only.

- `AUTH_MW_DEBUG`
- `AUTH_ME_DEBUG`
- `ROUTE_LOADER_DEBUG`
- `DEBUG`

Recommended production values:

```bash
AUTH_MW_DEBUG=0
AUTH_ME_DEBUG=0
ROUTE_LOADER_DEBUG=0
DEBUG=false
```

Notes:

- Keep these disabled in normal operation to reduce sensitive metadata exposure in logs.
- Enable only during active troubleshooting windows, then disable again.
