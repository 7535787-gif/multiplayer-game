# syntax=docker/dockerfile:1

# Install all workspace dependencies for the build.
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci

# Build the TypeScript server and browser client.
FROM dependencies AS build
WORKDIR /app
COPY . .
ARG BUILD_VERSION=development
ARG GIT_SHA=unknown
ENV BUILD_VERSION=${BUILD_VERSION} GIT_SHA=${GIT_SHA}
RUN npm run build && mkdir -p /app/logs

# Keep production dependencies only; remove files not needed at runtime.
FROM dependencies AS production-deps
WORKDIR /app
RUN npm prune --omit=dev --omit=optional \
 && find node_modules -type d \
      \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name examples \) \
      -prune -exec rm -rf {} + \
 && find node_modules -type f \
      \( -name '*.md' -o -name '*.map' -o -name '*.d.ts' -o -name '*.ts' \) \
      ! -iname 'license*' ! -iname 'notice*' -delete

# Minimal, non-root runtime. Distroless provides Node.js but no shell or npm.
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
WORKDIR /app
ARG BUILD_VERSION=development
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    LOG_DIR=/app/logs \
    CLIENT_DIST=/app/client/dist \
    BUILD_VERSION=${BUILD_VERSION} \
    GIT_SHA=${GIT_SHA}
COPY --from=production-deps --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /app/server-dist ./server-dist
COPY --from=build --chown=nonroot:nonroot /app/client/dist ./client/dist
COPY --from=build --chown=nonroot:nonroot /app/logs ./logs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["server-dist/server/src/index.js"]
