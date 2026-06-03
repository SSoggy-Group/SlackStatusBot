# slack-spotify-status

A Node.js application that synchronizes the currently playing Spotify track with a user's Slack custom status.
This version uses the **Slack App Home** interface, so users can configure and enable/disable their status sync directly inside Slack!

## Requirements

- Node.js
- Slack Application (with Socket Mode, App Home, and `users.profile:write` scope)
- Spotify Application

## Configuration

Copy `.env.example` to `.env` and fill in the required variables:

```bash
cp .env.example .env
```

Variables required:
- `SLACK_APP_TOKEN`: An App-Level token starting with `xapp-` (from Basic Information -> App-Level Tokens).
- `SLACK_BOT_TOKEN`: A Bot User OAuth token starting with `xoxb-` (from OAuth & Permissions).
- `SLACK_CLIENT_ID`: The client ID of your Slack application.
- `SLACK_CLIENT_SECRET`: The client secret of your Slack application.
- `SPOTIFY_CLIENT_ID`: The client ID of your Spotify application.
- `SPOTIFY_CLIENT_SECRET`: The client secret of your Spotify application.
- `PUBLIC_URL`: The public URL where this server is hosted. This is ONLY needed for the Spotify OAuth redirect.

## Setup

1. **Enable Socket Mode** in your Slack App settings.
2. **Enable App Home** in your Slack App settings and ensure the "Messages Tab" is enabled if you want users to DM it, but specifically the **Home Tab** must be enabled.
3. Configure your Spotify App's Redirect URIs to include `${PUBLIC_URL}/spotify/callback`.
4. Configure your Slack App's Redirect URLs (in OAuth & Permissions) to include `${PUBLIC_URL}/slack/callback`.
5. Start the server:

```bash
npm install
node src/index.js
```

## Usage

Users just open the Slack application, click on your bot's name to open its App Home, and follow the setup instructions there. They can turn the sync on and off seamlessly from within Slack.
