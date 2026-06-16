# Cloud Run Job：訓練素材匯入 BQ（離線資料平面）
FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY scripts/training-ingest-batch.ts scripts/
COPY scripts/inventory-training-sources.mjs scripts/
COPY src/lib/ingest src/lib/ingest
COPY src/lib/bq src/lib/bq
COPY data/training-materials data/training-materials
COPY tsconfig.json tsconfig.json

ENV NODE_ENV=production
CMD ["npx", "tsx", "scripts/training-ingest-batch.ts", "--all"]
