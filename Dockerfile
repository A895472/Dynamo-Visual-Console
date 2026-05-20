# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Force npm to use public registry
RUN npm config set registry https://registry.npmjs.org/

COPY package.json ./
# Delete old lock file to regenerate clean one against public registry
RUN rm -f package-lock.json && npm install --no-audit --no-fund

COPY . .
# Build Vite frontend (mode prod → VITE_APP_MODE=remote)
RUN npm run build
# Compile standalone Node.js server
RUN npm run build:server

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
# Install only production dependencies (AWS SDK, etc.)
RUN npm config set registry https://registry.npmjs.org/ \
    && npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

EXPOSE 8080
ENV PORT=8080
ENV DYNAMO_REGION=eu-west-1

CMD ["node", "dist-server/index.js"]
