# OneBot 11 QQ integration

The production Cloudflare Worker owns OneBot connections. Each Bot is assigned its own SQLite-backed Durable Object instance, but the object deliberately uses no Storage API rows: hibernatable WebSocket attachments keep only the Bot identity, and pending action echoes stay in memory until response or timeout. Persistent configuration and QQ account data live in D1.

## Add a bot

Open **Admin → QQ group notifications**, add the bot QQ number and an optional display name, then save the one-time access token shown by the site. The token is stored only as a hash and cannot be viewed again; rotate it from the same page if it is lost.

Bot accounts and group allowlists are stored in D1. They are not environment variables and do not require a service restart. Each bot has an independent token; its group allowlist is compressed into the Bot row as JSON, with a maximum of 100 groups.

## Bot configuration

Create a OneBot 11 reverse WebSocket client with:

- URL: `wss://rettheory.top/api/onebot/ws`
- Access token: the one-time token generated for this bot in the admin page
- Message format: array
- Reconnect: enabled

The admin page reports a bot online only after the connection sends a lifecycle/event payload whose `self_id` matches the QQ number registered with that token. A mismatched account is ignored.

## Reader flow

1. On the login page, choose QQ Bot login or registration.
2. The website displays a ten-minute command such as `验证 ABCD-2345`.
3. Send that command to the bot shown by the website. When multiple bots are online, the site selects one available account for the flow.
4. The bot confirms the result and the browser completes login automatically.

Signed-in readers use the same flow with a `绑定` command. Both sides are one-to-one: one QQ account cannot bind multiple website accounts, and one website account cannot bind multiple QQ accounts.

## Group cards and image notices

The admin module lets administrators add or remove allowed groups for each bot. Sending a notification requires choosing an online bot and one of that bot's groups. Its default mode reuses the site's SVG-based rich-text editor. Before submission, the browser renders the title, rich text, inline images and destination link into a 960-pixel-wide PNG card. The card uses the Chinese/Latin Noto Sans CJK Bold fallback declared by the Andory renderer. The Worker validates the PNG and forwards it as a OneBot 11 `image` segment; it never converts the card to `share` or plain text.

The alternate mode accepts AVIF, GIF, JPEG, PNG and WebP images up to 8 MB and can prepend up to 500 characters of text. Both modes call `send_group_msg` over the active WebSocket. Delivery auditing is aggregated into one D1 row per UTC day, Bot and group; rich HTML and image bytes are not retained.

## Storage and cost controls

- `OneBotSession` never calls `ctx.storage`, creates no tables and schedules no alarms.
- WebSockets use `ctx.acceptWebSocket()` so idle connections can hibernate.
- Online status comes from `ctx.getWebSockets()` and is never persisted or heartbeat-polled.
- Successful QQ challenges are deleted immediately; pending challenges expire after ten minutes.
- Bot groups are stored in `onebot_bots.groups_json`, avoiding one row per group.
- Delivery history is daily aggregate metadata rather than one row per message.
