# Rust backend

Axum backend for reshi-diary. It owns admin and reader auth, Passkeys, posts, avatars, rewards, tickets, attachments, comments, reactions and site notifications.

## Local run

```bash
cp .env.example .env
cargo run
```

Without `RESEND_API_KEY`, debug builds print the six-digit login code to the backend log. Release builds fail closed with HTTP 503.

## Production

Build `backend/Dockerfile`, attach a persistent volume at `/app/data`, set `PUBLIC_ORIGIN` to the public frontend origin, then set the optional frontend Worker variable `RUST_BACKEND_ORIGIN` to this service's HTTPS origin. When it is absent, the Worker uses its built-in D1 API.

Rust is the production backend for all API capabilities. Existing D1 posts are not copied automatically; export/import them before switching production traffic.

Passkey registration and login are implemented by `webauthn-rs`. `PASSKEY_RP_ID` must be the public site's registrable domain (for example `rettheory.top`) and `PUBLIC_ORIGIN` must exactly match the browser origin. Challenges and credential counters are stored server-side in SQLite.

Passkeys previously registered in the D1/TypeScript backend are not copied automatically. Register a new passkey once after switching to Rust; email login remains available as the recovery path. Before enabling Rust in production, migrate D1 content and verify the new persistent volume.

## Reader and community API

- `POST /api/auth/send-code` and `/api/auth/verify-code`: passwordless registration/login.
- `POST /api/auth/passkey-options` and `/api/auth/passkey-verify`: reader Passkey login.
- `/api/account/passkeys*`: authenticated reader Passkey registration and listing.
- `/api/account/avatar`, `/tasks`, `/check-in`: profile image and daily rewards.
- `/api/account/tickets` and `/api/admin/tickets*`: reader support workflow.
- `/api/posts/{slug}/community`, `/comments`, `/reactions`: discussion and post reactions.
- `/api/notifications/active`: current public notice.
- `/api/admin/notification`: create, update or remove the active notice.

Reader and admin cookies are separate. Mutating requests verify the public origin, and Passkey challenges are single-use with a five-minute TTL.
