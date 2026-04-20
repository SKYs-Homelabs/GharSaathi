# Stage 1: Build frontend
FROM node:25-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.23-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod ./
RUN go mod download || true
COPY backend/ ./
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/gharsaathi .

# Stage 3: Final slim image
FROM alpine:3.20 AS final
RUN apk add --no-cache tini ca-certificates tzdata
WORKDIR /app

COPY --from=backend-builder /app/gharsaathi ./gharsaathi
COPY --from=frontend-builder /app/client/dist ./public

RUN mkdir -p /app/data && \
    addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/gharsaathi"]
