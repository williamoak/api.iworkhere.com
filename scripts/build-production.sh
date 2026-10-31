
#!/usr/bin/env bash
set -Eeuo pipefail

exec /data/websites/iworkhere/deployment/api/build-production.sh "$@"
