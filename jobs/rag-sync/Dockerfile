# Cloud Run Job：Vertex RAG corpus 同步（離線資料平面）
FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY scripts/rag scripts/rag
COPY src/lib/rag src/lib/rag
COPY src/platform src/platform
COPY data/training-materials data/training-materials
COPY tsconfig.json tsconfig.json

ENV NODE_ENV=production
CMD ["npx", "tsx", "scripts/rag/rag-ingest-training.ts", "--all"]
