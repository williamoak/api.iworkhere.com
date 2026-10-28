
#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_DIR="${DEPLOY_DIR:-$SOURCE_DIR/deployment/api-pro}"
BUILD_DIR=""
APP_KEY="${APP_KEY:-api-pro.iworkhere.com}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://www.iworkhere.com,https://joinaunion-pro.iworkhere.com}"

cleanup() {
    if [[ -n "$BUILD_DIR" && -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
    fi
}
trap cleanup EXIT

log() {
    printf '[build-production] %s\n' "$*"
}

fail() {
    printf '[build-production] ERROR: %s\n' "$*" >&2
    exit 1
}

# --------------------------------------------------
# Validate environment
# --------------------------------------------------

command -v npm >/dev/null 2>&1 ||
    fail "npm is not installed"

command -v rsync >/dev/null 2>&1 ||
    fail "rsync is not installed"

command -v docker >/dev/null 2>&1 ||
    fail "docker is not installed"

docker compose version >/dev/null 2>&1 ||
    fail "Docker Compose is not available"

[[ -f "$SOURCE_DIR/package.json" ]] ||
    fail "Source package.json not found"

[[ -f "$SOURCE_DIR/package-lock.json" ]] ||
    fail "Source package-lock.json not found"

[[ -f "$DEPLOY_DIR/Dockerfile" ]] ||
    fail "Deployment Dockerfile not found: $DEPLOY_DIR/Dockerfile"

[[ -f "$DEPLOY_DIR/compose.yaml" ]] ||
    fail "Deployment Compose file not found: $DEPLOY_DIR/compose.yaml"

[[ -d /data/secrets/production/api ]] ||
    fail "API secrets directory not found: /data/secrets/production/api"

[[ -d /data/secrets/production/cockroach ]] ||
    fail "CockroachDB secrets directory not found: /data/secrets/production/cockroach"

[[ -f /data/secrets/production/redis-password ]] ||
    fail "Redis password file not found: /data/secrets/production/redis-password"

# --------------------------------------------------
# Build TypeScript
# --------------------------------------------------

log "Building TypeScript application"

cd "$SOURCE_DIR"

npm run build

[[ -f "$SOURCE_DIR/dist/start.js" ]] ||
    fail "Compiled entry point dist/start.js not found"

# --------------------------------------------------
# Validate required runtime assets
# --------------------------------------------------

for directory in \
    dist \
    public \
    src/admin/client/assets \
    readme
do
    [[ -d "$SOURCE_DIR/$directory" ]] ||
        fail "Required directory missing: $directory"
done

for file in \
    package.json \
    package-lock.json \
    README.md \
    swagger.json
do
    [[ -f "$SOURCE_DIR/$file" ]] ||
        fail "Required file missing: $file"
done

BUILD_DIR="$(mktemp -d /tmp/api-pro-build.XXXXXX)"
log "Preparing temporary Docker build context"
cp "$DEPLOY_DIR/Dockerfile" "$DEPLOY_DIR/compose.yaml" "$DEPLOY_DIR/.env.docker.public" "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/dist" "$BUILD_DIR/public" "$BUILD_DIR/admin" "$BUILD_DIR/readme"

log "Synchronizing compiled JavaScript"

rsync -a --delete \
    "$SOURCE_DIR/dist/" \
    "$BUILD_DIR/dist/"

# --------------------------------------------------
# Synchronize static files
# --------------------------------------------------

log "Synchronizing public assets"

rsync -a --delete \
    "$SOURCE_DIR/public/" \
    "$BUILD_DIR/public/"

log "Synchronizing administrative assets"

mkdir -p "$BUILD_DIR/admin/assets"

rsync -a --delete \
    "$SOURCE_DIR/src/admin/client/assets/" \
    "$BUILD_DIR/admin/assets/"

log "Synchronizing documentation"

rsync -a --delete \
    "$SOURCE_DIR/readme/" \
    "$BUILD_DIR/readme/"

# --------------------------------------------------
# Copy application manifests
# --------------------------------------------------

log "Copying production manifests"

cp "$SOURCE_DIR/package.json" \
   "$SOURCE_DIR/package-lock.json" \
   "$SOURCE_DIR/README.md" \
   "$SOURCE_DIR/swagger.json" \
   "$BUILD_DIR/"

# --------------------------------------------------
# Completed
# --------------------------------------------------

log "Production package synchronized successfully"

du -sh "$BUILD_DIR"

# --------------------------------------------------
# Build and start the production container stack
# --------------------------------------------------

log "Building Docker image api-pro.iworkhere.com"

docker build \
    --tag api-pro.iworkhere.com \
    "$BUILD_DIR"

log "Validating Docker Compose configuration"

(
    cd "$BUILD_DIR"
    APP_KEY="$APP_KEY" \
    CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
    docker compose -f compose.yaml config -q
)

log "Starting api-pro.iworkhere.com with Docker Compose"

(
    cd "$BUILD_DIR"
    APP_KEY="$APP_KEY" \
    CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
    docker compose -f compose.yaml up -d --force-recreate api redis
)

log "Production stack started"

(
    cd "$BUILD_DIR"
    APP_KEY="$APP_KEY" \
    CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
    docker compose -f compose.yaml ps
)
