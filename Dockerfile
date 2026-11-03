# --- Build stage ---
FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM dependencies AS seed
COPY data ./data
COPY scripts ./scripts
COPY src/domain ./src/domain
CMD ["npx", "--no-install", "tsx", "scripts/seed.ts"]

FROM dependencies AS builder
COPY . .
RUN npm run build

# --- Production stage ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/ui-entrypoint.sh /usr/local/bin/vpd-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["sh", "/usr/local/bin/vpd-entrypoint.sh"]

CMD ["nginx", "-g", "daemon off;"]
