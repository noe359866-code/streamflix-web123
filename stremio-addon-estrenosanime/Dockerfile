FROM node:22-alpine

WORKDIR /app

# Dependencias primero (mejor caché de capas)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY scripts ./scripts

ENV PORT=7000
EXPOSE 7000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

USER node
CMD ["node", "src/index.js"]
