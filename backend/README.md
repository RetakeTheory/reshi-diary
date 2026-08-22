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

Passkey registration and login are implemented by `webauthn-rs`. `PASSKEY_RP_ID` must be the public site's registrable domain (for example `rettheory.top`) and `PUBLIC_ORIGIN` must exactly match the browser origin. Challenges and credential counters are stored server-side in SQLite.

Passkeys previously registered in the D1/TypeScript backend are not copied automatically. Register a new passkey once after switching to Rust; email login remains available as the recovery path. Before enabling Rust in production, migrate D1 content and verify the new persistent volume.

