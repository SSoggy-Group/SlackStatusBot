require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
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

const POLL_INTERVAL_MS = 10_000;
const STATUS_EMOJI = process.env.STATUS_EMOJI || ':headphones:';
const MAX_STATUS_LENGTH = 100;
const PORT = process.env.PORT || 8888;

const missing = [
  ['SLACK_APP_TOKEN', SLACK_APP_TOKEN],
  ['SLACK_BOT_TOKEN', SLACK_BOT_TOKEN],
  ['SLACK_CLIENT_ID', SLACK_CLIENT_ID],
  ['SLACK_CLIENT_SECRET', SLACK_CLIENT_SECRET],
  ['SPOTIFY_CLIENT_ID', SPOTIFY_CLIENT_ID],
  ['SPOTIFY_CLIENT_SECRET', SPOTIFY_CLIENT_SECRET],
  ['PUBLIC_URL', PUBLIC_URL],
].filter(([, v]) => !v);

if (missing.length) {
  console.warn(`Warning: Missing env vars: ${missing.map(([k]) => k).join(', ')}. Bot may not fully function until configured.`);
}

// Set up Express app for standard OAuth web routes
const expressApp = express();

// Set up Bolt App using Socket Mode
const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true
});

// ── Web Routes for OAuth ──────────────────────────────────

expressApp.get('/install', (req, res) => {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    user_scope: 'users.profile:write',
    redirect_uri: `${PUBLIC_URL}/slack/callback`,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

expressApp.get('/slack/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing Slack code');

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

    const slackToken = response.data.authed_user.access_token;
    const slackUserId = response.data.authed_user.id;

    db.saveUser(slackUserId, { slackToken, lastTrack: null });

    // Inform user to go back to Slack
    res.send(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px;">
        <h1>Slack Authorized!</h1>
        <p>Please return to the Slack App Home tab to connect Spotify.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Slack OAuth Error:', err.message);
    res.status(500).send('Failed to authenticate with Slack');
  }
});

expressApp.get('/spotify/login', (req, res) => {
  const { slackUserId } = req.query;
  if (!slackUserId) return res.status(400).send('Missing slackUserId');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: 'user-read-currently-playing',
    redirect_uri: `${PUBLIC_URL}/spotify/callback`,
    state: slackUserId,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

expressApp.get('/spotify/callback', async (req, res) => {
  const code = req.query.code;
  const slackUserId = req.query.state;

  if (!code || !slackUserId) return res.status(400).send('Missing code or state');

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

    db.saveUser(slackUserId, { spotifyRefreshToken: response.data.refresh_token });

    res.send(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px;">
        <h1>Spotify Connected!</h1>
        <p>You're all set! Return to the Slack App Home.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Spotify OAuth Error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Spotify');
  }
});

// ── App Home UI ───────────────────────────────────────────

app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    const user = db.getUser(event.user);
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Spotify to Slack Status Configuration' }
      },
      { type: 'divider' }
    ];

    if (!user || !user.slackToken) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Step 1:* Grant the bot permission to update your custom status.' }
      });
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Authorize Slack' },
          url: `${PUBLIC_URL}/install`,
          action_id: 'link_slack'
        }]
      });
    } else if (!user.spotifyRefreshToken) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '✅ Slack authorized!\n\n*Step 2:* Connect your Spotify account to read your current track.' }
      });
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Connect Spotify' },
          url: `${PUBLIC_URL}/spotify/login?slackUserId=${event.user}`,
          action_id: 'link_spotify'
        }]
      });
    } else {
      const isEnabled = user.enabled !== false;
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '✅ *All accounts connected!*' }
      });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `Status sync is currently: *${isEnabled ? 'Enabled' : 'Disabled'}*` }
      });
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: isEnabled ? 'Disable Sync' : 'Enable Sync' },
          style: isEnabled ? 'danger' : 'primary',
          action_id: 'toggle_sync',
          value: isEnabled ? 'disable' : 'enable'
        }]
      });
    }

    await client.views.publish({
      user_id: event.user,
      view: { type: 'home', blocks }
    });
  } catch (error) {
    logger.error(error);
  }
});

// Acknowledge URL button clicks (prevents error triangle in Slack)
app.action('link_slack', async ({ ack }) => { await ack(); });
app.action('link_spotify', async ({ ack }) => { await ack(); });

app.action('toggle_sync', async ({ body, ack, client }) => {
  await ack();
  const userId = body.user.id;
  const actionValue = body.actions[0].value;
  
  const isEnabled = actionValue === 'enable';
  db.saveUser(userId, { enabled: isEnabled });

  // If disabling, also clear their status immediately
  if (!isEnabled) {
    const user = db.getUser(userId);
    if (user && user.slackToken && user.lastTrack) {
      try {
        await setSlackStatus(user.slackToken, '', '');
        db.saveUser(userId, { lastTrack: null });
      } catch (e) {
        console.error('Failed to clear status on disable:', e.message);
      }
    }
  }

  // Refresh the App Home view
  app.client.events.emit('app_home_opened', {
    event: { user: userId },
    client,
    logger: app.logger
  });
});

// ── Polling Engine ────────────────────────────────────────

async function getSpotifyAccessToken(refreshToken) {
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

async function getCurrentlyPlaying(accessToken) {
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

  let statusText;
  if (currently_playing_type === 'episode') {
    statusText = `${item.name} - ${item.show?.name || 'Podcast'}`;
  } else {
    const artists = item.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
    statusText = `${item.name} - ${artists}`;
  }

  if (statusText.length > MAX_STATUS_LENGTH) {
    statusText = statusText.substring(0, MAX_STATUS_LENGTH - 1) + '…';
  }
  return statusText;
}

async function setSlackStatus(slackToken, text, emoji) {
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
        Authorization: `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.data.ok) throw new Error(response.data.error);
}

async function pollAllUsers() {
  const users = db.getAllUsers();
  
  for (const slackUserId of Object.keys(users)) {
    const user = users[slackUserId];
    
    if (!user.slackToken || !user.spotifyRefreshToken || user.enabled === false) {
      continue;
    }

    try {
      const accessToken = await getSpotifyAccessToken(user.spotifyRefreshToken);
      const currentTrack = await getCurrentlyPlaying(accessToken);

      if (currentTrack) {
        if (currentTrack !== user.lastTrack) {
          await setSlackStatus(user.slackToken, currentTrack, STATUS_EMOJI);
          db.saveUser(slackUserId, { lastTrack: currentTrack });
          console.log(`[${slackUserId}] Status updated: ${currentTrack}`);
        }
      } else {
        if (user.lastTrack) {
          await setSlackStatus(user.slackToken, '', '');
          db.saveUser(slackUserId, { lastTrack: null });
          console.log(`[${slackUserId}] Status cleared`);
        }
      }
    } catch (err) {
      console.error(`[${slackUserId}] Error:`, err.response?.data || err.message);
    }
  }
}

// ── Startup ───────────────────────────────────────────────

(async () => {
  await app.start();
  expressApp.listen(PORT, () => {
    console.log(`Express OAuth server is running on port ${PORT}`);
  });
  console.log(`⚡️ Bolt app is running with Socket Mode!`);
  
  pollAllUsers();
  setInterval(pollAllUsers, POLL_INTERVAL_MS);
})();
