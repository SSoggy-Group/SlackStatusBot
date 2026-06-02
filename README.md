# Spotify to Slack Status Bot

A simple Node.js bot that automatically syncs your currently playing Spotify track (or podcast) to your Slack custom status.

When you play a song, your Slack status becomes: `:headphones: Song Name - Artist Name`.
When you pause or stop the music, your Slack status is cleared.

## Prerequisites
- Node.js installed on your machine
- A Slack Workspace where you are allowed to install custom apps

## Setup Instructions

### 1. Project Setup
Clone this repository and install dependencies:
```bash
npm install
```

Copy the example environment file:
```bash
cp .env.example .env
```

### 2. Getting your Slack Token
1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new App ("From scratch").
2. Go to **OAuth & Permissions** in the sidebar.
3. Under **User Token Scopes**, add the `users.profile:write` scope.
4. Scroll up and click **Install to Workspace**. Make sure to select the specific workspace where you want your status to be updated.
5. Copy the **User OAuth Token** (it starts with `xoxp-`) and paste it into `SLACK_USER_TOKEN` in your `.env` file.

### 3. Getting your Spotify Credentials
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Go to **Settings** for your new app.
3. Under **Redirect URIs**, add exactly: `http://127.0.0.1:8888/callback` and click Save.
4. Copy your **Client ID** and **Client Secret** and paste them into your `.env` file.

### 4. Authenticating with Spotify
You need to grant your bot permission to read what you are currently playing.

1. Run the one-time authentication script:
```bash
node get_token.js
```
2. Open [http://127.0.0.1:8888/login](http://127.0.0.1:8888/login) in your browser.
3. Authorize the app with your Spotify account.
4. You will see a **Refresh Token** on the success screen. Copy it and paste it into `SPOTIFY_REFRESH_TOKEN` in your `.env` file.
5. Stop the authentication script (press `Ctrl+C` in your terminal).

## Usage
Start the bot:
```bash
node index.js
```

The bot will poll Spotify every 10 seconds in the background and update your Slack status automatically. You can safely minimize the terminal window and leave it running.

## Options
You can customize the emoji used in your status by modifying the `STATUS_EMOJI` variable in your `.env` file. For example:
```
STATUS_EMOJI=:musical_note:
```
