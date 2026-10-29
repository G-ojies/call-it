# Call It

Call It is a single-process Twitch chat game. Viewers predict the probability that an event resolves YES. Calls are scored with the Brier score, `(probability - outcome)²`, so lower scores mean better calibration and accuracy.

## Requirements

- Node.js 20 or newer
- A Twitch channel

## Use it on your stream

```sh
npm install
cp .env.example .env
```

Set `TWITCH_CHANNEL` in `.env` to the channel name (with or without `#`). The bot connects anonymously in read-only mode by default. To enable chat replies, set `TWITCH_BOT_USERNAME` and `TWITCH_OAUTH_TOKEN` to the bot account's username and a user access token with `chat:read` and `chat:edit` scopes. The token may be supplied with or without the `oauth:` prefix.

You can get a token in either of these ways:

- Visit [TwitchTokenGenerator](https://twitchtokengenerator.com), sign in as the bot account, and grant `chat:read` and `chat:edit`.
- Install the [Twitch CLI](https://dev.twitch.tv/docs/cli/), register/configure a Twitch application with `twitch configure`, then generate a user token with `twitch token --user-token --scopes "chat:read chat:edit"`. The CLI user-token flow uses `http://localhost:3000` as the registered OAuth redirect URL. [Twitch CLI token guide](https://dev.twitch.tv/docs/cli/token-command/)

Put the username and token in `.env`:

```dotenv
TWITCH_CHANNEL=your_channel_name
TWITCH_BOT_USERNAME=your_bot_username
TWITCH_OAUTH_TOKEN=oauth:your_user_access_token
PORT=3030
```

The web server listens on `PORT` (default `3030`). Open `http://localhost:3030/control` for streamer controls; that page and its control endpoint accept requests from localhost only. In OBS, add a **Browser Source** with URL `http://localhost:3030/overlay` and dimensions **1920 × 1080**. It has a transparent background and receives live histogram updates over WebSocket.

```sh
npm run dev       # run with TypeScript watch mode
npm run demo      # simulate five questions with 40 chatters; no Twitch connection
npm run build     # compile to dist/
npm test          # run unit tests
npm run lint      # lint TypeScript and browser JavaScript
npm start         # run compiled output
```

The demo uses an in-memory session and does not change `data/session.json`. The build serves the files from `public/` directly, so keep that directory beside `dist/` when deploying.

## Chat commands

- `!q <text>` — broadcaster or moderator opens a question
- `!call <0-100>` — any viewer records a YES probability; `70`, `70%`, and `0.7` all mean 70%. The latest call replaces that viewer's previous call until locked.
- `!lock` — broadcaster or moderator stops calls
- `!yes` / `!no` — broadcaster or moderator resolves the locked question and scores calls
- `!cancel` — broadcaster or moderator discards the open question and its calls
- `!me` — in reply mode, shows the viewer's mean Brier score and resolved call count

Leaderboard data includes viewers with at least three resolved calls; lower mean Brier scores rank first. The full session, including accumulated scores and any open question, is stored in `data/session.json`.
