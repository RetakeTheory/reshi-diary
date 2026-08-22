# Rust backend

Axum backend for reshi-diary. It preserves the existing JSON shapes and `/api` routes for email auth, posts and attachments.

## Local run

```bash
cp .env.example .env
cargo run
```

Without `RESEND_API_KEY`, debug builds print the six-digit login code to the backend log. Release builds fail closed with HTTP 503.

## Production

Build `backend/Dockerfile`, attach a persistent volume at `/app/data`, set `PUBLIC_ORIGIN` to the public frontend origin, then set the frontend Worker variable `RUST_BACKEND_ORIGIN` to this service's HTTPS origin.

The existing D1 backend remains active when `RUST_BACKEND_ORIGIN` is absent. This makes the migration opt-in and rollback-safe. Existing D1 posts are not copied automatically; export/import them before switching production traffic.

Passkey endpoints are disabled after enabling the Rust origin. Email login is the supported auth path. Before enabling Rust in production, migrate D1 content and verify the new persistent volume.

