
# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim

ENV NODE_ENV=production
ENV PORT=4201

WORKDIR /app

# Copy dependency manifests first to improve build caching.
COPY package.json package-lock.json ./

# Install production dependencies only.
# Skip the project's Git-hook prepare script.
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# Keep the runtime identity addressable by name and match the host's
# www-data:local ownership on externally mounted secrets.
RUN groupadd --gid 1001 local

# Copy compiled application and runtime resources.
COPY dist/ ./dist/
COPY public/ ./public/
COPY admin/ ./admin/
COPY readme/ ./readme/
COPY README.md swagger.json ./

# Run as the named non-root deployment user.
USER www-data:local

EXPOSE 4201

CMD ["node", "dist/start.js"]
