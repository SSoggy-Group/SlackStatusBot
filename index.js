// Polls Spotify for the currently playing track/podcast and
// updates your Slack custom status accordingly.

require('dotenv').config();
const axios = require('axios');

const {
  SLACK_USER_TOKEN,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
} = process.env;

const POLL_INTERVAL_MS = 10_000;
const STATUS_EMOJI = ':headphones:';
const MAX_STATUS_LENGTH = 100;

// Validate that all required env vars are set
const missing = [
  ['SLACK_USER_TOKEN', SLACK_USER_TOKEN],
  ['SPOTIFY_CLIENT_ID', SPOTIFY_CLIENT_ID],
  ['SPOTIFY_CLIENT_SECRET', SPOTIFY_CLIENT_SECRET],
  ['SPOTIFY_REFRESH_TOKEN', SPOTIFY_REFRESH_TOKEN],
].filter(([, v]) => !v);

if (missing.length) {
  console.error(`Missing env vars: ${missing.map(([k]) => k).join(', ')}`);
  process.exit(1);
}

let lastStatusText = null;

async function getSpotifyAccessToken() {
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
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

  // 204 means nothing is playing
  if (response.status === 204 || !response.data) {
    return null;
  }

  const { is_playing, item, currently_playing_type } = response.data;

  if (!is_playing || !item) {
    return null;
  }

  let statusText;

  if (currently_playing_type === 'episode') {
    const showName = item.show?.name || 'Podcast';
    statusText = `${item.name} - ${showName}`;
  } else {
    const artists = item.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
    statusText = `${item.name} - ${artists}`;
  }

  if (statusText.length > MAX_STATUS_LENGTH) {
    statusText = statusText.substring(0, MAX_STATUS_LENGTH - 1) + '…';
  }

  return statusText;
}

async function setSlackStatus(text, emoji) {
  const profile = {
    status_text: text || '',
    status_emoji: emoji || '',
  };

  await axios.post(
    'https://slack.com/api/users.profile.set',
    { profile },
    {
      headers: {
        Authorization: `Bearer ${SLACK_USER_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

async function poll() {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] Checking Spotify...`);

  try {
    const accessToken = await getSpotifyAccessToken();
    const currentTrack = await getCurrentlyPlaying(accessToken);

    if (currentTrack) {
      if (currentTrack !== lastStatusText) {
        await setSlackStatus(currentTrack, STATUS_EMOJI);
        lastStatusText = currentTrack;
        console.log(`  Status updated: "${currentTrack}"`);
      } else {
        console.log('  Same track, skipping.');
      }
    } else {
      if (lastStatusText) {
        await setSlackStatus('', '');
        lastStatusText = null;
        console.log('  Music paused, status cleared.');
      } else {
        console.log('  Nothing playing.');
      }
    }
  } catch (err) {
    console.error('  Error:', err.response?.data || err.message);
  }
}

console.log('Spotify to Slack status bot started');
console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s\n`);

poll();
setInterval(poll, POLL_INTERVAL_MS);
