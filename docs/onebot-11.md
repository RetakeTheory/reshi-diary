# OneBot 11 QQ integration

The production Rust backend is the only OneBot connection owner. The bot opens one reverse WebSocket to the public site; incoming events and outgoing actions share that connection.

## Backend configuration

Set these environment variables on the Rust service:

```dotenv
ONEBOT_ACCESS_TOKEN=<a long random token>
ONEBOT_BOT_ID=<the bot QQ number>
ONEBOT_ALLOWED_GROUP_IDS=<group 1>,<group 2>
```

Restart the Rust service after changing them. Do not put the access token in the repository or a public Worker variable.

## Bot configuration

Create a OneBot 11 reverse WebSocket client with:

- URL: `wss://rettheory.top/api/onebot/ws`
- Access token: the exact value of `ONEBOT_ACCESS_TOKEN`
- Message format: array
- Reconnect: enabled

If the public Worker is bypassed in a private deployment, use the Rust backend's own WSS URL with the same `/api/onebot/ws` path.

The admin page reports the bot online only after the connection sends a lifecycle/event payload whose `self_id` matches `ONEBOT_BOT_ID`.

## Reader flow

1. On the login page, choose QQ Bot login or registration.
2. The website displays a ten-minute command such as `验证 ABCD-2345`.
3. Send that command to the configured bot in a private chat.
4. The bot confirms the result and the browser completes login automatically.

Signed-in readers use the same flow with a `绑定` command. Both sides are one-to-one: one QQ account cannot bind multiple website accounts, and one website account cannot bind multiple QQ accounts.

## Group cards and image notices

The admin module only lists groups in `ONEBOT_ALLOWED_GROUP_IDS`. Its default mode reuses the site's SVG-based rich-text editor. The Rust service sanitizes that HTML, extracts a plain card summary, uses the first safe image as the cover, and sends the standard OneBot 11 `share` message segment. This keeps the card compatible across OneBot 11 implementations; typography and layout are ultimately rendered by QQ rather than copied from browser CSS.

The alternate mode accepts AVIF, GIF, JPEG, PNG and WebP images up to 8 MB and can prepend up to 500 characters of text. Both modes call `send_group_msg` over the active WebSocket. Audit records contain destination, payload type, size, result and message ID; rich HTML and image bytes are not retained.
