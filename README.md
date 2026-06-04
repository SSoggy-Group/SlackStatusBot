# slack-spotify-status

a simple bot i built to sync whatever i'm listening to on spotify straight to my slack status. 

it has a full UI in the slack App Home tab so you can actually connect your accounts, customize your emoji, and turn the sync on and off without running any commands or dealing with config files. it also supports multiple users, so if u host it once, anyone in your slack workspace can use it.

## features
- reads your current spotify song every 10 seconds
- updates your slack status with `{song} - {artist}` (u can customize this)
- lets you type a comma-separated list of emojis in the settings (e.g. `:notes:, :headphones:`) and it picks a random one every song change
- clears your status automatically if you pause your music
- UI settings menu directly inside slack (App Home tab)

## how to run it

you'll need node.js installed. clone this repo, and then copy the env file:
```bash
cp .env.example .env
```

then you have to go make apps in both the slack dev dashboard and the spotify dev dashboard to get all these keys for your `.env` file:
- `SLACK_APP_TOKEN`: starts with `xapp-` (from basic info -> app-level tokens)
- `SLACK_BOT_TOKEN`: starts with `xoxb-` (from oauth & permissions)
- `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`: your slack app credentials
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`: your spotify app credentials
- `PUBLIC_URL`: the public url where you are hosting this (needed for the oauth callbacks)

### important dashboard settings:
1. **slack:** turn on Socket Mode. turn on App Home (specifically the Home Tab). add `${PUBLIC_URL}/slack/callback` to the redirect urls.
2. **spotify:** add `${PUBLIC_URL}/spotify/callback` to the redirect uris.

then just install and run:
```bash
npm install
node src/index.js
```
*(or use pm2 so it stays alive in the background)*

## usage
just click on the bot's name in slack to open its App Home tab. click the buttons to authorize your slack and spotify accounts, turn on the sync toggle, and you're good to go.
