# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: compile the React Admin bundle.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Relative by default: the browser calls the API on the same origin through
# the reverse proxy. Override with an absolute URL for split deployments.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: nginx serves the static bundle with an SPA fallback.
#
# The unprivileged image runs as UID 101 and listens on 8080, so the container
# needs no root privileges and no extra capabilities.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
