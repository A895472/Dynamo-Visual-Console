# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Force npm to use public registry
RUN npm config set registry https://registry.npmjs.org/

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
