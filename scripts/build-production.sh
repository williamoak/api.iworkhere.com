
#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
TARGET_DIR="${TARGET_DIR:-/data/websites/iworkhere/api-pro.iworkhere.com}"
APP_KEY="${APP_KEY:-api-pro.iworkhere.com}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://www.iworkhere.com}"

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

[[ -d "$TARGET_DIR" ]] ||
    fail "Production directory not found: $TARGET_DIR"

[[ -f "$TARGET_DIR/Dockerfile" ]] ||
    fail "Production Dockerfile not found: $TARGET_DIR/Dockerfile"

[[ -f "$TARGET_DIR/compose.yaml" ]] ||
    fail "Production Compose file not found: $TARGET_DIR/compose.yaml"

[[ -d /data/secrets/api ]] ||
    fail "API secrets directory not found: /data/secrets/api"

[[ -d /data/secrets/cockroach ]] ||
    fail "CockroachDB secrets directory not found: /data/secrets/cockroach"

[[ -f /data/secrets/redis-password ]] ||
    fail "Redis password file not found: /data/secrets/redis-password"

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

# --------------------------------------------------
# Synchronize compiled application
# --------------------------------------------------

log "Synchronizing compiled JavaScript"

rsync -a --delete \
    "$SOURCE_DIR/dist/" \
    "$TARGET_DIR/dist/"

# --------------------------------------------------
# Synchronize static files
# --------------------------------------------------

log "Synchronizing public assets"

rsync -a --delete \
    "$SOURCE_DIR/public/" \
    "$TARGET_DIR/public/"

log "Synchronizing administrative assets"

mkdir -p "$TARGET_DIR/admin/assets"

rsync -a --delete \
    "$SOURCE_DIR/src/admin/client/assets/" \
    "$TARGET_DIR/admin/assets/"

log "Synchronizing documentation"

rsync -a --delete \
    "$SOURCE_DIR/readme/" \
    "$TARGET_DIR/readme/"

# --------------------------------------------------
# Copy application manifests
# --------------------------------------------------

log "Copying production manifests"

cp "$SOURCE_DIR/package.json" \
   "$SOURCE_DIR/package-lock.json" \
   "$SOURCE_DIR/README.md" \
   "$SOURCE_DIR/swagger.json" \
   "$TARGET_DIR/"

# --------------------------------------------------
# Completed
# --------------------------------------------------

log "Production package synchronized successfully"

du -sh "$TARGET_DIR"

# --------------------------------------------------
# Build and start the production container stack
# --------------------------------------------------

log "Building Docker image api-pro.iworkhere.com"

docker build \
    --tag api-pro.iworkhere.com \
    "$TARGET_DIR"

log "Validating Docker Compose configuration"

(
    cd "$TARGET_DIR"
    APP_KEY="$APP_KEY" \
    CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
    docker compose -f compose.yaml config -q
)

log "Starting api-pro.iworkhere.com with Docker Compose"

(
    cd "$TARGET_DIR"
    APP_KEY="$APP_KEY" \
    CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
    docker compose -f compose.yaml up -d --force-recreate api redis
)

log "Production stack started"

(
    cd "$TARGET_DIR"
    APP_KEY="$APP_KEY" \
    CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
    docker compose -f compose.yaml ps
)
