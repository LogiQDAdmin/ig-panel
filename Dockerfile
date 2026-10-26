# syntax=docker/dockerfile:1
# Panel de la automatización de Instagram de LogiQD (app de Umbrel).
FROM node:24-trixie-slim AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && node --test test/*.test.mjs && npm prune --omit=dev

FROM node:24-trixie-slim AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server-build /build/server/dist /app/server/dist
COPY --from=server-build /build/server/node_modules /app/server/node_modules
COPY --from=server-build /build/server/package.json /app/server/package.json
COPY --from=web-build /build/web/dist /app/web/dist
COPY scripts/ /app/scripts/
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIR=/app/web/dist \
    APP_VERSION=$APP_VERSION \
    PGPORT=5432 \
    PGDATABASE=ig \
    PGUSER=ig \
    PGHOST=ig-db.internal
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
    CMD ["node", "/app/scripts/healthcheck.mjs"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "/app/server/dist/index.js"]
