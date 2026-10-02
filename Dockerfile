FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY backend backend
# The mobile workspace is not needed to build the server.
RUN node -e "const p=require('./package.json');p.workspaces=['backend','packages/*'];require('fs').writeFileSync('package.json',JSON.stringify(p))" \
 && npm ci --workspace backend --workspace packages/shared --include-workspace-root=false \
 && npx -w backend prisma generate \
 && npm run build -w @ereader/shared && npm run build -w @ereader/backend

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production UPLOADS_DIR=/data/uploads PORT=4000
COPY --from=build /app /app
VOLUME /data
EXPOSE 4000
WORKDIR /app/backend
CMD ["npm", "start"]
