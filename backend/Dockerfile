FROM rust:1.89-bookworm AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY migrations ./migrations
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/reshi-diary-backend /usr/local/bin/reshi-diary-backend
RUN mkdir -p /app/data/uploads
ENV LISTEN_ADDR=0.0.0.0:8788 DATABASE_URL=sqlite://data/reshi-diary.db UPLOAD_DIR=data/uploads SESSION_SECURE=true
EXPOSE 8788
VOLUME ["/app/data"]
CMD ["reshi-diary-backend"]
