# OneBot 11 QQ integration

The production Rust backend is the only OneBot connection owner. Multiple bots can each open a reverse WebSocket to the public site; incoming events and outgoing actions share the matching bot connection.

## Add a bot

Open **Admin → QQ group notifications**, add the bot QQ number and an optional display name, then save the one-time access token shown by the site. The token is stored only as a hash and cannot be viewed again; rotate it from the same page if it is lost.

Bot accounts and group allowlists are stored in the Rust service database. They are not environment variables and do not require a service restart. Each bot has an independent token and group list.

## Bot configuration

Create a OneBot 11 reverse WebSocket client with:

- URL: `wss://rettheory.top/api/onebot/ws`
- Access token: the one-time token generated for this bot in the admin page
- Message format: array
- Reconnect: enabled

If the public Worker is bypassed in a private deployment, use the Rust backend's own WSS URL with the same `/api/onebot/ws` path.

The admin page reports a bot online only after the connection sends a lifecycle/event payload whose `self_id` matches the QQ number registered with that token. A mismatched account is ignored.

## Reader flow

1. On the login page, choose QQ Bot login or registration.
2. The website displays a ten-minute command such as `验证 ABCD-2345`.
3. Send that command to the bot shown by the website. When multiple bots are online, the site selects one available account for the flow.
4. The bot confirms the result and the browser completes login automatically.

Signed-in readers use the same flow with a `绑定` command. Both sides are one-to-one: one QQ account cannot bind multiple website accounts, and one website account cannot bind multiple QQ accounts.

## Group cards and image notices

The admin module lets administrators add or remove allowed groups for each bot. Sending a notification requires choosing an online bot and one of that bot's groups. Its default mode reuses the site's SVG-based rich-text editor. The Rust service sanitizes that HTML, extracts a plain card summary, uses the first safe image as the cover, and sends the standard OneBot 11 `share` message segment. This keeps the card compatible across OneBot 11 implementations; typography and layout are ultimately rendered by QQ rather than copied from browser CSS.

The alternate mode accepts AVIF, GIF, JPEG, PNG and WebP images up to 8 MB and can prepend up to 500 characters of text. Both modes call `send_group_msg` over the active WebSocket. Audit records contain destination, payload type, size, result and message ID; rich HTML and image bytes are not retained.
