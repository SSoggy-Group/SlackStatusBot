require('dotenv').config();
const { App } = require('@slack/bolt');
const axios = require('axios');
const db = require('./db');
const express = require('express');

const {
  SLACK_APP_TOKEN,
  SLACK_BOT_TOKEN,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  PUBLIC_URL,
} = process.env;

const pollInterval = 10000;
const defaultEmoji = process.env.STATUS_EMOJI || ':headphones:';
const defaultFormat = '{song} - {artist}';
const maxLen = 100;
const port = process.env.PORT || 8888;

const requiredVars = [
  ['SLACK_APP_TOKEN', SLACK_APP_TOKEN],
  ['SLACK_BOT_TOKEN', SLACK_BOT_TOKEN],
  ['SLACK_CLIENT_ID', SLACK_CLIENT_ID],
  ['SLACK_CLIENT_SECRET', SLACK_CLIENT_SECRET],
  ['SPOTIFY_CLIENT_ID', SPOTIFY_CLIENT_ID],
  ['SPOTIFY_CLIENT_SECRET', SPOTIFY_CLIENT_SECRET],
  ['PUBLIC_URL', PUBLIC_URL],
].filter(([, v]) => !v);

if (requiredVars.length > 0) {
  console.warn(`Missing env vars: ${requiredVars.map(([k]) => k).join(', ')}`);
}

const server = express();
const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true
});

// Web Routes

server.get('/install', (req, res) => {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    user_scope: 'users.profile:write',
    redirect_uri: `${PUBLIC_URL}/slack/callback`,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

server.get('/slack/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${PUBLIC_URL}/slack/callback`,
      }
    });

    if (!response.data.ok) throw new Error(response.data.error);

    const token = response.data.authed_user.access_token;
    const userId = response.data.authed_user.id;

    db.saveUser(userId, { slackToken: token, lastTrack: null });

    res.send(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px;">
        <h2>Slack Authorized</h2>
        <p>Please return to the Slack App Home tab to connect Spotify.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Slack OAuth Error:', err.message);
    res.status(500).send('Authentication failed');
  }
});

server.get('/spotify/login', (req, res) => {
  const { slackUserId } = req.query;
  if (!slackUserId) return res.status(400).send('Missing userId');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: 'user-read-currently-playing',
    redirect_uri: `${PUBLIC_URL}/spotify/callback`,
    state: slackUserId,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

server.get('/spotify/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${PUBLIC_URL}/spotify/callback`,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
      }
    );

    db.saveUser(userId, { spotifyRefreshToken: response.data.refresh_token });

    res.send(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px;">
        <h2>Spotify Connected</h2>
        <p>You can close this window.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Spotify OAuth Error:', err.message);
    res.status(500).send('Authentication failed');
  }
});

// UI Rendering

async function updateHomeView(userId, client) {
  const user = db.getUser(userId) || {};
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Settings' }
    }
  ];

  const slackBtn = {
    type: 'button',
    text: { type: 'plain_text', text: user.slackToken ? 'Unauthorize' : 'Authorize Slack' },
    style: user.slackToken ? 'danger' : 'primary',
    action_id: user.slackToken ? 'unauth_slack' : 'link_slack'
  };
  if (!user.slackToken) slackBtn.url = `${PUBLIC_URL}/install`;

  const spotifyBtn = {
    type: 'button',
    text: { type: 'plain_text', text: user.spotifyRefreshToken ? 'Unauthorize' : 'Connect Spotify' },
    style: user.spotifyRefreshToken ? 'danger' : 'primary',
    action_id: user.spotifyRefreshToken ? 'unauth_spotify' : 'link_spotify'
  };
  if (!user.spotifyRefreshToken) spotifyBtn.url = `${PUBLIC_URL}/spotify/login?slackUserId=${userId}`;

  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Accounts*' }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: user.slackToken ? '✅ *Slack*: Connected' : '❌ *Slack*: Not Connected' },
      accessory: slackBtn
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: user.spotifyRefreshToken ? '✅ *Spotify*: Connected' : '❌ *Spotify*: Not Connected' },
      accessory: spotifyBtn
    }
  );

  if (user.slackToken && user.spotifyRefreshToken) {
    const isEnabled = user.enabled !== false;
    const format = user.statusFormat || defaultFormat;
    const emoji = user.statusEmoji || defaultEmoji;
    const clearOnPause = user.clearOnPause !== false;

    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Customization*' }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Status Syncing:* ${isEnabled ? 'Active 🟢' : 'Paused 🔴'}` },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: isEnabled ? 'Disable Sync' : 'Enable Sync' },
          style: isEnabled ? 'danger' : 'primary',
          action_id: 'toggle_sync',
          value: isEnabled ? 'disable' : 'enable'
        }
      },
      {
        type: 'input',
        dispatch_action: true,
        element: {
          type: 'plain_text_input',
          action_id: 'update_emoji',
          initial_value: emoji,
          dispatch_action_config: { trigger_actions_on: ['on_enter_pressed', 'on_character_entered'] }
        },
        label: { type: 'plain_text', text: 'Status Emoji (e.g. :headphones:)' },
        hint: { type: 'plain_text', text: 'Must include the colons (e.g. :notes:)' }
      },
      {
        type: 'input',
        dispatch_action: true,
        element: {
          type: 'plain_text_input',
          action_id: 'update_format',
          initial_value: format,
          dispatch_action_config: { trigger_actions_on: ['on_enter_pressed', 'on_character_entered'] }
        },
        label: { type: 'plain_text', text: 'Status Format String' },
        hint: { type: 'plain_text', text: 'Placeholders: {song}, {artist}, {album}' }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Behavior*\nClear status when music pauses' },
        accessory: {
          type: 'checkboxes',
          action_id: 'update_clear_on_pause',
          options: [
            {
              text: { type: 'plain_text', text: 'Clear on pause' },
              value: 'clear'
            }
          ],
          initial_options: clearOnPause ? [{ text: { type: 'plain_text', text: 'Clear on pause' }, value: 'clear' }] : []
        }
      }
    );
  }

  await client.views.publish({
    user_id: userId,
    view: { type: 'home', blocks }
  });
}

// Slack Actions

slackApp.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    await updateHomeView(event.user, client);
  } catch (err) {
    logger.error(err);
  }
});

slackApp.action('link_slack', async ({ ack }) => { await ack(); });
slackApp.action('link_spotify', async ({ ack }) => { await ack(); });

slackApp.action('unauth_slack', async ({ body, ack, client }) => {
  await ack();
  const userId = body.user.id;
  db.saveUser(userId, { slackToken: null, lastTrack: null });
  await updateHomeView(userId, client);
});

slackApp.action('unauth_spotify', async ({ body, ack, client }) => {
  await ack();
  const userId = body.user.id;
  db.saveUser(userId, { spotifyRefreshToken: null, lastTrack: null });
  await updateHomeView(userId, client);
});

slackApp.action('toggle_sync', async ({ body, ack, client }) => {
  await ack();
  const userId = body.user.id;
  const isEnabled = body.actions[0].value === 'enable';
  
  db.saveUser(userId, { enabled: isEnabled });

  if (!isEnabled) {
    const user = db.getUser(userId);
    if (user && user.slackToken) {
      try {
        await updateSlackStatus(user.slackToken, '', '');
        db.saveUser(userId, { lastTrack: null });
      } catch (err) {
        console.error('Failed to clear status:', err.message);
      }
    }
  }

  await updateHomeView(userId, client);
});

slackApp.action('update_emoji', async ({ body, ack, action }) => {
  await ack();
  let emoji = action.value.trim();
  if (emoji && !emoji.startsWith(':')) emoji = ':' + emoji;
  if (emoji && !emoji.endsWith(':')) emoji = emoji + ':';
  db.saveUser(body.user.id, { statusEmoji: emoji, lastTrack: null });
});

slackApp.action('update_format', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { statusFormat: action.value, lastTrack: null });
});

slackApp.action('update_clear_on_pause', async ({ body, ack, action }) => {
  await ack();
  const isClearOnPause = action.selected_options.some(opt => opt.value === 'clear');
  db.saveUser(body.user.id, { clearOnPause: isClearOnPause, lastTrack: null });
});

// Background Polling

async function fetchSpotifyToken(refreshToken) {
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
    }
  );
  return response.data.access_token;
}

async function fetchCurrentTrack(accessToken) {
  const response = await axios.get(
    'https://api.spotify.com/v1/me/player/currently-playing',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      validateStatus: (status) => status < 300,
    }
  );

  if (response.status === 204 || !response.data) return null;
  
  const { is_playing, item, currently_playing_type } = response.data;
  if (!is_playing || !item) return null;

  let song, artist, album;
  if (currently_playing_type === 'episode') {
    song = item.name;
    artist = item.show?.name || 'Podcast';
    album = item.show?.publisher || 'Unknown';
  } else {
    song = item.name;
    artist = item.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
    album = item.album?.name || 'Unknown Album';
  }

  return { song, artist, album };
}

async function updateSlackStatus(token, text, emoji) {
  const response = await axios.post(
    'https://slack.com/api/users.profile.set',
    {
      profile: {
        status_text: text || '',
        status_emoji: emoji || '',
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.data.ok) throw new Error(response.data.error);
}

async function runPoll() {
  const users = db.getAllUsers();
  
  for (const userId of Object.keys(users)) {
    const user = users[userId];
    
    if (!user.slackToken || !user.spotifyRefreshToken || user.enabled === false) {
      continue;
    }

    try {
      const accessToken = await fetchSpotifyToken(user.spotifyRefreshToken);
      const track = await fetchCurrentTrack(accessToken);
      
      const format = user.statusFormat || defaultFormat;
      const emoji = user.statusEmoji || defaultEmoji;
      const clearOnPause = user.clearOnPause !== false;

      if (track) {
        let text = format
          .replace('{song}', track.song)
          .replace('{artist}', track.artist)
          .replace('{album}', track.album);
          
        if (text.length > maxLen) {
          text = text.substring(0, maxLen - 1) + '…';
        }

        if (text !== user.lastTrack) {
          await updateSlackStatus(user.slackToken, text, emoji);
          db.saveUser(userId, { lastTrack: text });
        }
      } else if (clearOnPause) {
        if (user.lastTrack) {
          await updateSlackStatus(user.slackToken, '', '');
          db.saveUser(userId, { lastTrack: null });
        }
      }
    } catch (err) {
      console.error(`Error for user ${userId}:`, err.message);
    }
  }
}

// Startup

(async () => {
  await slackApp.start();
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  console.log(`Bolt app is running.`);
  
  runPoll();
  setInterval(runPoll, pollInterval);
})();
