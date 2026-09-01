# OneBot 11 QQ integration

The production Cloudflare Worker owns OneBot connections. Each Bot is assigned its own SQLite-backed Durable Object instance. Hibernatable WebSocket attachments keep the Bot identity, pending action echoes stay in memory, and the object stores only a scheduler Bot ID plus one alarm. Persistent configuration, QQ account data and pending reminder contents live in D1.

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

The admin module lets administrators add or remove allowed groups for each bot. Sending a notification requires choosing an online bot and one of that bot's groups. Its default mode reuses the site's SVG-based rich-text editor. Before submission, the browser renders the title, rich text and inline images into a 960-pixel-wide PNG card. Administrators can select a preset or custom card tone and decide whether the destination URL appears in the centered footer. Chinese glyphs use Resource Han Rounded SC Bold; Latin letters and numerals use Noto Sans SC Bold. The Worker validates the PNG and forwards it as a OneBot 11 `image` segment; it never converts the card to `share` or plain text.

The alternate mode accepts AVIF, GIF, JPEG, PNG and WebP images up to 8 MB and can prepend up to 500 characters of text. Both modes call `send_group_msg` over the active WebSocket. Delivery auditing is aggregated into one D1 row per UTC day, Bot and group; rich HTML and image bytes are not retained.

Administrators can either send immediately or choose a future local date and time. The final browser-rendered image is temporarily stored under the existing private S3 `uploads/onebot-scheduled/` prefix, while D1 stores only the pending task metadata. A per-Bot Durable Object alarm provides fine-grained wakeups and a once-per-minute Cron Trigger is the recovery path. Successful and cancelled tasks delete both the D1 row and temporary image immediately. Failed tasks retry at most twice, then self-delete on the third failure.

## Private reminder commands

Users can send the Bot a private message in any of these forms:

- `30秒后提醒我喝水`
- `20分钟后提醒我取快递`
- `2小时后提醒我开会`
- `3天后提醒我交材料`
- `9月4日提醒我缴费`
- `9/4 12:00提醒我吃饭`
- `明天12点提醒我签到`

Fixed dates are interpreted in China Standard Time. A date without a year points to the next occurrence that has not passed, and a date without a time defaults to 09:00. Each QQ account may keep at most 30 pending reminders per Bot. Reminder text remains in D1 only until delivery; it is removed immediately after a successful send, cancellation, or the final failed attempt.

## Storage and cost controls

- `OneBotSession` stores no message contents. It keeps only one Bot identity key and one next-wakeup alarm per Bot.
- WebSockets use `ctx.acceptWebSocket()` so idle connections can hibernate.
- Online status comes from `ctx.getWebSockets()` and is never persisted or heartbeat-polled.
- Successful QQ challenges are deleted immediately; pending challenges expire after ten minutes.
- Bot groups are stored in `onebot_bots.groups_json`, avoiding one row per group.
- Delivery history is daily aggregate metadata rather than one row per message.
- Scheduled rows exist only while pending. Completed and exhausted tasks are deleted instead of becoming a history table.
