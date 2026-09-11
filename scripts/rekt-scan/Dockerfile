FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY scripts/rekt-scan/runtime/package.json scripts/rekt-scan/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/node_modules ./node_modules
COPY src/lib/rekt/ ./src/lib/rekt/
COPY scripts/rekt-scan/*.mts ./scripts/rekt-scan/
RUN mkdir /data && chown node:node /data
USER node
ENTRYPOINT ["node", "--experimental-strip-types"]
CMD ["scripts/rekt-scan/cli.mts", "--help"]
