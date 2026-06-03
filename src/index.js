require('dotenv').config();
const express = require('express');
const axios = require('axios');
const db = require('./db');

const {
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
  ['SLACK_CLIENT_ID', SLACK_CLIENT_ID],
  ['SLACK_CLIENT_SECRET', SLACK_CLIENT_SECRET],
  ['SPOTIFY_CLIENT_ID', SPOTIFY_CLIENT_ID],
  ['SPOTIFY_CLIENT_SECRET', SPOTIFY_CLIENT_SECRET],
  ['PUBLIC_URL', PUBLIC_URL],
].filter(([, v]) => !v);

if (missing.length) {
  console.error(`Missing env vars: ${missing.map(([k]) => k).join(', ')}`);
  process.exit(1);
}

const app = express();

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Spotify Slack Status</title></head>
      <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h1>Spotify to Slack Status</h1>
        <p>Sync your Spotify currently playing track to your Slack status.</p>
        <a href="/install" style="display:inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 4px;">
          Connect Slack
        </a>
      </body>
    </html>
  `);
});

app.get('/install', (req, res) => {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    user_scope: 'users.profile:write',
    redirect_uri: `${PUBLIC_URL}/slack/callback`,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

app.get('/slack/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing Slack code');
  }

  try {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${PUBLIC_URL}/slack/callback`,
      }
    });

    if (!response.data.ok) {
      throw new Error(response.data.error);
    }

    const slackToken = response.data.authed_user.access_token;
    const slackUserId = response.data.authed_user.id;

    db.saveUser(slackUserId, { slackToken, lastTrack: null });

    res.redirect(`/spotify/login?slackUserId=${slackUserId}`);
  } catch (err) {
    console.error('Slack OAuth Error:', err.message);
    res.status(500).send('Failed to authenticate with Slack');
  }
});

app.get('/spotify/login', (req, res) => {
  const { slackUserId } = req.query;
  if (!slackUserId) {
    return res.status(400).send('Missing slackUserId');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: 'user-read-currently-playing',
    redirect_uri: `${PUBLIC_URL}/spotify/callback`,
    state: slackUserId,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/spotify/callback', async (req, res) => {
  const code = req.query.code;
  const slackUserId = req.query.state;

  if (!code || !slackUserId) {
    return res.status(400).send('Missing Spotify code or state');
  }

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
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h1>Setup complete</h1>
          <p>You can close this tab.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Spotify OAuth Error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Spotify');
  }
});

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

  if (response.status === 204 || !response.data) {
    return null;
  }
  
  const { is_playing, item, currently_playing_type } = response.data;
  if (!is_playing || !item) {
    return null;
  }

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

  if (!response.data.ok) {
    throw new Error(`Slack API error: ${response.data.error}`);
  }
}

async function pollAllUsers() {
  const users = db.getAllUsers();
  const userIds = Object.keys(users);

  for (const slackUserId of userIds) {
    const user = users[slackUserId];
    
    if (!user.slackToken || !user.spotifyRefreshToken) {
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Public URL: ${PUBLIC_URL}`);
  
  pollAllUsers();
  setInterval(pollAllUsers, POLL_INTERVAL_MS);
});
