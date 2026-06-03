# slack-spotify-status

A Node.js application that synchronizes the currently playing Spotify track with a user's Slack custom status.

## Requirements

- Node.js
- Slack Application (with `users.profile:write` scope)
- Spotify Application

## Configuration

Copy `.env.example` to `.env` and fill in the required variables:

```bash
cp .env.example .env
```

Variables required:
- `SLACK_CLIENT_ID`: The client ID of your Slack application.
- `SLACK_CLIENT_SECRET`: The client secret of your Slack application.
- `SPOTIFY_CLIENT_ID`: The client ID of your Spotify application.
- `SPOTIFY_CLIENT_SECRET`: The client secret of your Spotify application.
- `PUBLIC_URL`: The public URL where this server is hosted (e.g., a Render URL or an ngrok tunnel). Do not include a trailing slash.

Optional variables:
- `STATUS_EMOJI`: The emoji to use for the Slack status (default: `:headphones:`).

## Setup

1. Configure your Slack App's Redirect URLs to include `${PUBLIC_URL}/slack/callback`.
2. Configure your Spotify App's Redirect URIs to include `${PUBLIC_URL}/spotify/callback`.
3. Start the server:

```bash
npm install
node index.js
```

## Usage

Navigate to the `PUBLIC_URL` in a browser and follow the installation flow to link the Slack and Spotify accounts. The server will poll Spotify and update the linked Slack account's status automatically. User credentials are saved locally in `users.json`.
