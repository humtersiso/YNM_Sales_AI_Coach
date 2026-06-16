# YNM 雙助手 API（不含 Next.js UI）
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs apiuser

COPY package.json package-lock.json ./
COPY apps/api-server/package.json apps/api-server/
COPY packages packages/
RUN npm ci --workspace=@ynm/api-server --include-workspace-root

COPY apps/api-server apps/api-server
COPY packages packages
COPY src/lib src/lib
COPY src/platform src/platform
COPY docs/openapi.yaml docs/openapi.yaml
COPY tsconfig.json tsconfig.json

USER apiuser
WORKDIR /app/apps/api-server
EXPOSE 8080
CMD ["npx", "tsx", "--tsconfig", "tsconfig.json", "src/index.ts"]
