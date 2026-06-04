require('dotenv').config();
const { App } = require('@slack/bolt');
const axios = require('axios');
const db = require('./db');
const express = require('express');
const xboxAuth = require('@xboxreplay/xboxlive-auth');
const xboxApi = require('@xboxreplay/xboxlive-api');

const {
  SLACK_APP_TOKEN,
  SLACK_BOT_TOKEN,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  PUBLIC_URL,
  LASTFM_API_KEY,
  STEAM_API_KEY,
  TRAKT_CLIENT_ID,
  TRAKT_CLIENT_SECRET,
  HACKATIME_CLIENT_ID,
  HACKATIME_CLIENT_SECRET,
  GITHUB_API_KEY,
  XBOX_CLIENT_ID,
  XBOX_CLIENT_SECRET,
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
  ['LASTFM_API_KEY', LASTFM_API_KEY],
  ['STEAM_API_KEY', STEAM_API_KEY],
  ['TRAKT_CLIENT_ID', TRAKT_CLIENT_ID],
  ['TRAKT_CLIENT_SECRET', TRAKT_CLIENT_SECRET],
  ['HACKATIME_CLIENT_ID', HACKATIME_CLIENT_ID],
  ['HACKATIME_CLIENT_SECRET', HACKATIME_CLIENT_SECRET],
  ['PUBLIC_URL', PUBLIC_URL],
].filter(([, v]) => !v);

if (requiredVars.length > 0) {
  console.warn(`Missing env vars: ${requiredVars.map(([k]) => k).join(', ')}`);
}

const server = express();
server.disable('x-powered-by');
const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true
});



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

server.get('/hackatime/login', (req, res) => {
  const { slackUserId } = req.query;
  if (!slackUserId) return res.status(400).send('Missing userId');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: HACKATIME_CLIENT_ID,
    scope: 'profile read',
    redirect_uri: `${PUBLIC_URL}/hackatime/callback`,
    state: slackUserId,
  });

  res.redirect(`https://hackatime.hackclub.com/oauth/authorize?${params.toString()}`);
});

server.get('/hackatime/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    const response = await axios.post(
      'https://hackatime.hackclub.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: HACKATIME_CLIENT_ID,
        client_secret: HACKATIME_CLIENT_SECRET,
        redirect_uri: `${PUBLIC_URL}/hackatime/callback`,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    db.saveUser(userId, { hackatimeAccessToken: response.data.access_token });

    res.send(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px;">
        <h2>Hackatime Connected!</h2>
        <p>You can close this window.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Hackatime OAuth Error:', err.message);
    res.status(500).send('Authentication failed');
  }
});

server.get('/trakt/auth', (req, res) => {
  const slackUserId = req.query.user;
  if (!slackUserId) return res.send('Missing user ID');
  const state = encodeURIComponent(slackUserId);
  const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(`${PUBLIC_URL}/trakt/callback`)}&state=${state}`;
  res.redirect(authUrl);
});

server.get('/trakt/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.send('Missing code or state');
  const slackUserId = decodeURIComponent(state);

  try {
    const response = await axios.post('https://api.trakt.tv/oauth/token', {
      code,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      redirect_uri: `${PUBLIC_URL}/trakt/callback`,
      grant_type: 'authorization_code'
    });

    db.saveUser(slackUserId, { 
      traktAccessToken: response.data.access_token,
      traktRefreshToken: response.data.refresh_token
    });

    res.send('Trakt authenticated successfully! You can close this tab and return to Slack.');
    const client = slackApp.client;
    const user = db.getUser(slackUserId);
    if (user && user.slackToken) await updateHomeView(slackUserId, client);
  } catch (err) {
    console.error('Trakt auth error', err.response?.data || err.message);
    res.send('Failed to authenticate with Trakt.');
  }
});

server.get('/xbox/auth', (req, res) => {
  const slackUserId = req.query.user;
  if (!slackUserId) return res.send('Missing user ID');
  const state = encodeURIComponent(slackUserId);
  const authUrl = xboxAuth.live.getAuthorizeUrl(XBOX_CLIENT_ID, 'XboxLive.signin offline_access', 'code', `${PUBLIC_URL}/xbox/callback`);
  res.redirect(`${authUrl}&state=${state}`);
});

server.get('/xbox/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.send('Missing code or state');
  const slackUserId = decodeURIComponent(state);

  try {
    const msAuth = await xboxAuth.live.exchangeCodeForAccessToken(code, XBOX_CLIENT_ID, 'XboxLive.signin offline_access', `${PUBLIC_URL}/xbox/callback`, XBOX_CLIENT_SECRET);
    const userToken = await xboxAuth.xnet.exchangeRpsTicketForUserToken(msAuth.access_token, 'd');
    const xsts = await xboxAuth.xnet.exchangeTokensForXSTSToken({ userTokens: [userToken.Token] }, { XSTSRelyingParty: 'http://xboxlive.com' });

    db.saveUser(slackUserId, { 
      xboxXstsToken: xsts.Token, 
      xboxUserHash: xsts.DisplayClaims.xui[0].uhs 
    });

    res.send('Xbox authenticated successfully! You can close this tab and return to Slack.');
    const client = slackApp.client;
    const user = db.getUser(slackUserId);
    if (user && user.slackToken) await updateHomeView(slackUserId, client);
  } catch (err) {
    console.error('Xbox auth error', err.response?.data || err.message || err);
    res.send('Failed to authenticate with Xbox.');
  }
});

function getAccountBlocks(user, userId) {
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

  const hackatimeBtn = {
    type: 'button',
    text: { type: 'plain_text', text: user.hackatimeAccessToken ? 'Unauthorize' : 'Connect Hackatime' },
    style: user.hackatimeAccessToken ? 'danger' : 'primary',
    action_id: user.hackatimeAccessToken ? 'unauth_hackatime' : 'link_hackatime'
  };
  if (!user.hackatimeAccessToken) hackatimeBtn.url = `${PUBLIC_URL}/hackatime/login?slackUserId=${userId}`;

  let blocks = [
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*Accounts*' } },
    { type: 'section', text: { type: 'mrkdwn', text: user.slackToken ? '✅ *Slack*: Connected' : '❌ *Slack*: Not Connected' }, accessory: slackBtn },
    { type: 'section', text: { type: 'mrkdwn', text: user.spotifyRefreshToken ? '✅ *Spotify*: Connected' : '❌ *Spotify*: Not Connected' }, accessory: spotifyBtn }
  ];

  if (HACKATIME_CLIENT_ID && HACKATIME_CLIENT_SECRET) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: user.hackatimeAccessToken ? '✅ *Hackatime*: Connected' : '❌ *Hackatime*: Not Connected' },
      accessory: hackatimeBtn
    });
  }



  if (XBOX_CLIENT_ID && XBOX_CLIENT_SECRET) {
    if (user.xboxXstsToken) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Xbox Live* :white_check_mark:\nAuthenticated' },
        accessory: { type: 'button', text: { type: 'plain_text', text: 'Unlink' }, action_id: 'unauth_xbox', style: 'danger' }
      });
    } else {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Xbox Live* :x:\nNot authenticated' },
        accessory: { type: 'button', text: { type: 'plain_text', text: 'Link Xbox' }, action_id: 'link_xbox', url: `${PUBLIC_URL}/xbox/auth?user=${userId}`, style: 'primary' }
      });
    }
  }

  if (TRAKT_CLIENT_ID && TRAKT_CLIENT_SECRET) {
    if (user.traktAccessToken) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Trakt* :white_check_mark:\nAuthenticated' },
        accessory: { type: 'button', text: { type: 'plain_text', text: 'Unlink' }, action_id: 'unauth_trakt', style: 'danger' }
      });
    } else {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Trakt* :x:\nNot authenticated' },
        accessory: { type: 'button', text: { type: 'plain_text', text: 'Link Trakt' }, action_id: 'link_trakt', url: `${PUBLIC_URL}/trakt/auth?user=${userId}`, style: 'primary' }
      });
    }
  }

  return blocks;
}

function getCustomizationBlocks(user) {
  const isEnabled = user.enabled !== false;
  const format = user.statusFormat || defaultFormat;
  const emoji = user.statusEmoji || defaultEmoji;
  const clearOnPause = user.clearOnPause !== false;

  const options = [
    { text: { type: 'plain_text', text: 'Spotify' }, value: 'spotify' },
    { text: { type: 'plain_text', text: 'Last.fm' }, value: 'lastfm' },
    { text: { type: 'plain_text', text: 'Steam' }, value: 'steam' },
    { text: { type: 'plain_text', text: 'Xbox Live' }, value: 'xbox' },
    { text: { type: 'plain_text', text: 'GitHub' }, value: 'github' },
    { text: { type: 'plain_text', text: 'Hackatime (Coding)' }, value: 'wakatime' },
    { text: { type: 'plain_text', text: 'Trakt' }, value: 'trakt' },
    { text: { type: 'plain_text', text: 'Jellyfin' }, value: 'jellyfin' },
    { text: { type: 'plain_text', text: 'Plex' }, value: 'plex' },
    { text: { type: 'plain_text', text: 'Lichess' }, value: 'lichess' },
    { text: { type: 'plain_text', text: 'Chess.com' }, value: 'chesscom' },
    { text: { type: 'plain_text', text: 'Duolingo' }, value: 'duolingo' }
  ];

  const userSources = user.dataSources || (user.dataSource ? [user.dataSource] : ['spotify']);
  const initialOptions = options.filter(o => userSources.includes(o.value));

  let blocks = [
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*Customization*' } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Active Data Sources*\nSelect multiple to cycle or combine them!' },
      accessory: {
        type: 'multi_static_select',
        action_id: 'update_data_source',
        options: options,
        initial_options: initialOptions.length > 0 ? initialOptions : [options[0]]
      }
    }
  ];

  const cycleSpeed = user.cycleSpeed || 10;
  const cycleOptions = [
    { text: { type: 'plain_text', text: '10 seconds' }, value: '10' },
    { text: { type: 'plain_text', text: '30 seconds' }, value: '30' },
    { text: { type: 'plain_text', text: '1 minute' }, value: '60' },
    { text: { type: 'plain_text', text: '5 minutes' }, value: '300' }
  ];

  const displayMode = user.displayMode || 'cycle';
  const displayModeOptions = [
    { text: { type: 'plain_text', text: 'Cycle (One at a time)' }, value: 'cycle' },
    { text: { type: 'plain_text', text: 'All at once (Combined)' }, value: 'combined' }
  ];

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'static_select',
        action_id: 'update_display_mode',
        options: displayModeOptions,
        initial_option: displayModeOptions.find(o => o.value === displayMode),
        placeholder: { type: 'plain_text', text: 'Display Mode' }
      },
      {
        type: 'static_select',
        action_id: 'update_cycle_speed',
        options: cycleOptions,
        initial_option: cycleOptions.find(o => o.value === cycleSpeed.toString()),
        placeholder: { type: 'plain_text', text: 'Cycle Speed' }
      }
    ]
  });

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'input', dispatch_action: true, optional: true,
    element: { type: 'plain_text_input', action_id: 'update_default_pfp', initial_value: user.defaultPfp || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
    label: { type: 'plain_text', text: 'Default PFP URL' }, hint: { type: 'plain_text', text: 'Reverts to this when nothing is playing.' }
  });

  function addPlatformUI(id, label) {
    if (!userSources.includes(id)) return;
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${label} Settings*` } });

    if (id === 'lastfm') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_lastfm_username', initial_value: user.lastFmUsername || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Last.fm Username' }
      });
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_lastfm_apikey', initial_value: user.lastFmApiKey || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Last.fm API Key' },
        hint: { type: 'plain_text', text: 'Optional. Leave blank to use server default.' }
      });
      const lfmCbOpts = [{ text: { type: 'plain_text', text: 'Show Play Count' }, value: 'true' }];
      const playcountBlock = {
        type: 'actions', elements: [{ type: 'checkboxes', action_id: 'update_lastfm_playcount', options: lfmCbOpts }]
      };
      if (user.lastFmPlayCount) playcountBlock.elements[0].initial_options = lfmCbOpts;
      blocks.push(playcountBlock);
    } else if (id === 'steam') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_steam_id', initial_value: user.steamId || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Steam ID (64-bit)' }
      });
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_steam_apikey', initial_value: user.steamApiKey || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Steam API Key' },
        hint: { type: 'plain_text', text: 'Optional. Leave blank to use server default.' }
      });
    } else if (id === 'github') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_github_username', initial_value: user.githubUsername || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'GitHub Username' }
      });
    } else if (id === 'xbox') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_xbox_gamertag', initial_value: user.xboxGamertag || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Xbox Gamertag' }
      });
    } else if (id === 'jellyfin') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_jellyfin_url', initial_value: user.jellyfinUrl || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Jellyfin Server URL' }
      });
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_jellyfin_apikey', initial_value: user.jellyfinApiKey || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Jellyfin API Key' }
      });
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_jellyfin_username', initial_value: user.jellyfinUsername || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Jellyfin Username' }
      });
    } else if (id === 'plex') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_plex_url', initial_value: user.plexUrl || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Plex Server URL' }
      });
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_plex_token', initial_value: user.plexToken || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Plex Token' }
      });
    } else if (id === 'lichess') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_lichess_username', initial_value: user.lichessUsername || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Lichess Username' }
      });
    } else if (id === 'chesscom') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_chesscom_username', initial_value: user.chesscomUsername || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Chess.com Username' }
      });
    } else if (id === 'duolingo') {
      blocks.push({
        type: 'input', dispatch_action: true, optional: true,
        element: { type: 'plain_text_input', action_id: 'update_duolingo_username', initial_value: user.duolingoUsername || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
        label: { type: 'plain_text', text: 'Duolingo Username' }
      });
    }

    blocks.push({
      type: 'input', dispatch_action: true, optional: true,
      element: { type: 'plain_text_input', action_id: `update_${id}_emoji`, initial_value: user[`${id}Emoji`] || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
      label: { type: 'plain_text', text: `${label} Emoji` }, hint: { type: 'plain_text', text: 'e.g. :headphones:' }
    });
    blocks.push({
      type: 'input', dispatch_action: true, optional: true,
      element: { type: 'plain_text_input', action_id: `update_${id}_pfp`, initial_value: user[`${id}Pfp`] || '', dispatch_action_config: { trigger_actions_on: ['on_enter_pressed'] } },
      label: { type: 'plain_text', text: `${label} PFP URL` }
    });
  }

  addPlatformUI('spotify', 'Spotify');
  addPlatformUI('lastfm', 'Last.fm');
  addPlatformUI('steam', 'Steam');
  addPlatformUI('xbox', 'Xbox');
  addPlatformUI('github', 'GitHub');
  addPlatformUI('wakatime', 'Hackatime');
  addPlatformUI('trakt', 'Trakt');
  addPlatformUI('jellyfin', 'Jellyfin');

  blocks.push(
    { type: 'divider' },
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
      type: 'input', dispatch_action: true,
      element: { type: 'plain_text_input', action_id: 'update_emoji', initial_value: emoji, dispatch_action_config: { trigger_actions_on: ['on_enter_pressed', 'on_character_entered'] } },
      label: { type: 'plain_text', text: 'Global Default Emoji' }, hint: { type: 'plain_text', text: 'Used if platform emoji is empty' }
    },
    {
      type: 'input', dispatch_action: true,
      element: { type: 'plain_text_input', action_id: 'update_format', initial_value: format, dispatch_action_config: { trigger_actions_on: ['on_enter_pressed', 'on_character_entered'] } },
      label: { type: 'plain_text', text: 'Status Format String' }, hint: { type: 'plain_text', text: 'Placeholders: {song}/{title}/{game}/{project}, {artist}/{show}/{language}' }
    }
  );
  
  const clearOnPauseBlock = {
    type: 'section',
    text: { type: 'mrkdwn', text: '*Behavior*\nClear status when paused' },
    accessory: {
      type: 'checkboxes', action_id: 'update_clear_on_pause',
      options: [{ text: { type: 'plain_text', text: 'Clear on pause' }, value: 'clear' }]
    }
  };
  if (clearOnPause) clearOnPauseBlock.accessory.initial_options = [{ text: { type: 'plain_text', text: 'Clear on pause' }, value: 'clear' }];
  blocks.push(clearOnPauseBlock);

  return blocks;
}

async function updateHomeView(userId, client) {
  const user = db.getUser(userId) || {};
  let blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🎧 Slack Status Sync' } },
    ...getAccountBlocks(user, userId)
  ];

  if (user.slackToken) {
    blocks = blocks.concat(getCustomizationBlocks(user));
  }

  await client.views.publish({ user_id: userId, view: { type: 'home', blocks } });
}



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
    if (user?.slackToken) {
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

slackApp.action('update_lastfm_username', async ({ body, ack, action, client }) => {
  await ack();
  db.saveUser(body.user.id, { lastFmUsername: action.value.trim(), lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('update_lastfm_apikey', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { lastFmApiKey: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_steam_id', async ({ body, ack, action, client }) => {
  await ack();
  db.saveUser(body.user.id, { steamId: action.value.trim(), lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('update_steam_apikey', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { steamApiKey: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_github_username', async ({ body, ack, action, client }) => {
  await ack();
  db.saveUser(body.user.id, { githubUsername: action.value.trim(), lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('update_trakt_username', async ({ body, ack, action, client }) => {
  await ack();
  db.saveUser(body.user.id, { traktUsername: action.value.trim(), lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('update_trakt_clientid', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { traktClientId: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_plex_url', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { plexUrl: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_plex_token', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { plexToken: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_lichess_username', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { lichessUsername: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_chesscom_username', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { chesscomUsername: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_duolingo_username', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { duolingoUsername: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_jellyfin_url', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { jellyfinUrl: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_jellyfin_apikey', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { jellyfinApiKey: action.value?.trim() || '', lastTrack: null });
});

slackApp.action('update_jellyfin_username', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { jellyfinUsername: action.value?.trim() || '', lastTrack: null });
});

slackApp.action(/^update_(.*)_(emoji|pfp)$/, async ({ body, ack, action }) => {
  await ack();
  const actionId = action.action_id;
  const match = actionId.match(/^update_(.*)_(emoji|pfp)$/);
  if (match) {
    const platform = match[1];
    const type = match[2];
    let key = '';
    let val = action.value ? action.value.trim() : '';

    if (platform === 'default' && type === 'pfp') {
      key = 'defaultPfp';
    } else {
      key = `${platform}${type === 'emoji' ? 'Emoji' : 'Pfp'}`;
      if (type === 'emoji' && val) {
        if (!val.startsWith(':')) val = ':' + val;
        if (!val.endsWith(':')) val = val + ':';
      }
    }
    db.saveUser(body.user.id, { [key]: val, lastTrack: null });
  }
});

slackApp.action('link_hackatime', async ({ ack }) => { await ack(); });
slackApp.action('unauth_hackatime', async ({ body, ack, client }) => {
  await ack();
  db.saveUser(body.user.id, { hackatimeAccessToken: null, hackatimeRefreshToken: null, lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('link_xbox', async ({ ack }) => { await ack(); });
slackApp.action('unauth_xbox', async ({ body, ack, client }) => {
  await ack();
  db.saveUser(body.user.id, { xboxXstsToken: null, xboxUserHash: null, lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('link_trakt', async ({ ack }) => { await ack(); });
slackApp.action('unauth_trakt', async ({ body, ack, client }) => {
  await ack();
  db.saveUser(body.user.id, { traktAccessToken: null, traktRefreshToken: null, lastTrack: null });
  await updateHomeView(body.user.id, client);
});

slackApp.action('update_data_source', async ({ body, ack, action, client }) => {
  await ack();
  const vals = action.selected_options.map(o => o.value);
  let defaultFormat = '{song} - {artist}';
  if (vals.length === 1) {
    const val = vals[0];
    if (val === 'steam') defaultFormat = '{game}';
    if (val === 'wakatime') defaultFormat = 'Coding in {language}';
    if (val === 'trakt') defaultFormat = 'Watching {show} - {title}';
  }

  const user = db.getUser(body.user.id);
  const updates = { dataSources: vals, dataSource: vals.length > 0 ? vals[0] : null, lastTrack: null };
  if (!user.statusFormat) updates.statusFormat = defaultFormat;

  db.saveUser(body.user.id, updates);
  await updateHomeView(body.user.id, client);
});

slackApp.action('update_display_mode', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { displayMode: action.selected_option.value, lastTrack: null });
});

slackApp.action('update_cycle_speed', async ({ body, ack, action }) => {
  await ack();
  db.saveUser(body.user.id, { cycleSpeed: parseInt(action.selected_option.value), lastTrack: null });
});

slackApp.action('update_lastfm_playcount', async ({ body, ack, action }) => {
  await ack();
  const isEnabled = action.selected_options.some(opt => opt.value === 'true');
  db.saveUser(body.user.id, { lastFmPlayCount: isEnabled, lastTrack: null });
});

async function setProfilePicture(token, imageUrl) {
  if (!imageUrl) return;
  try {
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imgResponse.data, 'binary');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('image', buffer, { filename: 'pfp.jpg', contentType: imgResponse.headers['content-type'] });
    const response = await axios.post('https://slack.com/api/users.setPhoto', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` }
    });
    if (!response.data.ok) throw new Error(response.data.error);
  } catch (err) {
    console.error('Failed to update PFP:', err.message);
  }
}


async function fetchJellyfinActivity(serverUrl, apiKey, username) {
  if (!serverUrl || !apiKey || !username) return null;
  try {
    const baseUrl = serverUrl.replace(/\/$/, '');
    const response = await axios.get(`${baseUrl}/Sessions`, {
      headers: { 'X-Emby-Token': apiKey },
      validateStatus: (status) => status < 300
    });
    const session = response.data?.find(s => s.UserName?.toLowerCase() === username.toLowerCase() && s.NowPlayingItem);
    if (!session) return null;
    const item = session.NowPlayingItem;
    if (item.Type === 'Episode') {
      return { title: item.Name, show: item.SeriesName || 'TV Show', song: item.Name, artist: item.SeriesName };
    } else if (item.Type === 'Movie') {
      return { title: item.Name, show: 'Movie', song: item.Name, artist: 'Movie' };
    }
    return { title: item.Name, show: 'Jellyfin', song: item.Name, artist: 'Jellyfin' };
  } catch (e) {
    console.error('Jellyfin Error:', e.message);
    return null;
  }
}

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

async function fetchLastFmTrack(username, fetchPlayCount = false, userApiKey = null) {
  const apiKey = userApiKey || LASTFM_API_KEY;
  if (!apiKey) return null;
  const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
    params: { method: 'user.getrecenttracks', user: username, api_key: apiKey, format: 'json', limit: 1 },
    validateStatus: (status) => status < 300
  });

  const track = response.data?.recenttracks?.track?.[0];
  if (!track || !track['@attr'] || track['@attr'].nowplaying !== 'true') return null;

  const result = { song: track.name, artist: track.artist['#text'], album: track.album['#text'] };

  if (fetchPlayCount) {
    try {
      const infoRes = await axios.get('http://ws.audioscrobbler.com/2.0/', {
        params: { method: 'track.getInfo', api_key: apiKey, artist: result.artist, track: result.song, username: username, format: 'json' }
      });
      if (infoRes.data?.track?.userplaycount) {
        result.playcount = infoRes.data.track.userplaycount;
      }
    } catch (e) {
      console.error('Failed to fetch playcount:', e.message);
    }
  }

  return result;
}

async function fetchSteamGame(steamId, userApiKey = null) {
  const apiKey = userApiKey || STEAM_API_KEY;
  if (!apiKey) return null;
  const response = await axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/`, {
    params: { key: apiKey, steamids: steamId },
    validateStatus: (status) => status < 300
  });
  
  const player = response.data?.response?.players?.[0];
  if (!player || !player.gameextrainfo) return null;

  return { game: player.gameextrainfo, song: player.gameextrainfo, artist: 'Steam' };
}

async function fetchTraktWatching(accessToken) {
  if (!accessToken) return null;
  const response = await axios.get(`https://api.trakt.tv/users/me/watching`, {
    headers: { 
      'trakt-api-version': '2', 
      'trakt-api-key': TRAKT_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`
    },
    validateStatus: (status) => status < 300
  });

  if (response.status === 204 || !response.data) return null;
  
  const data = response.data;
  if (data.type === 'episode') {
    return { title: data.episode.title, show: data.show.title, song: data.episode.title, artist: data.show.title };
  } else if (data.type === 'movie') {
    return { title: data.movie.title, show: 'Movie', song: data.movie.title, artist: 'Movie' };
  }
  return null;
}

async function fetchWakatimeActivity(accessToken) {
  const response = await axios.get(`https://hackatime.hackclub.com/api/v1/authenticated/heartbeats/latest`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: (status) => status < 300
  });

  const lastBeat = response.data;
  if (!lastBeat || !lastBeat.time) return null;

  const diffMinutes = (Date.now() - (lastBeat.time * 1000)) / 60000;
  
  // Wakatime heartbeats are sent every 2 mins usually. If > 10 mins old, user stopped coding.
  if (diffMinutes > 10) return null;

  return { 
    project: lastBeat.project || 'Unknown Project', 
    language: lastBeat.language || 'Unknown Language',
    song: lastBeat.project || 'Unknown Project',
    artist: lastBeat.language || 'Unknown Language'
  };
}

async function fetchLichessActivity(username) {
  if (!username) return null;
  const response = await axios.get(`https://lichess.org/api/user/${username}/current-game`, { validateStatus: (status) => status < 500 });
  if (response.status !== 200 || !response.data) return null;
  const game = response.data;
  let opponent = 'Unknown';
  if (game.players && game.players.white && game.players.white.user && game.players.white.user.name !== username) {
    opponent = game.players.white.user.name;
  } else if (game.players && game.players.black && game.players.black.user && game.players.black.user.name !== username) {
    opponent = game.players.black.user.name;
  }
  return { opponent, gameType: game.perf || 'Chess' };
}

async function fetchChessComActivity(username) {
  if (!username) return null;
  const response = await axios.get(`https://api.chess.com/pub/player/${username}/is-online`, { validateStatus: (status) => status < 500 });
  if (response.status !== 200 || !response.data || !response.data.online) return null;
  // Chess.com doesn't easily expose current game opponent without hitting another endpoint. We'll just show online playing.
  return { gameType: 'Chess' };
}

async function fetchDuolingoActivity(username) {
  if (!username) return null;
  const response = await axios.get(`https://www.duolingo.com/2017-06-30/users?username=${username}`, { validateStatus: (status) => status < 500 });
  if (response.status !== 200 || !response.data || !response.data.users || response.data.users.length === 0) return null;
  
  const duoUser = response.data.users[0];
  const currentLanguage = duoUser.currentCourse ? duoUser.currentCourse.title : 'a language';
  const streak = duoUser.streak || 0;
  
  return { currentLanguage, streak };
}

async function fetchPlexActivity(serverUrl, token) {
  if (!serverUrl || !token) return null;
  const normalizedUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  try {
    const response = await axios.get(`${normalizedUrl}/status/sessions`, {
      headers: { 'Accept': 'application/json', 'X-Plex-Token': token },
      validateStatus: (status) => status < 500
    });

    if (response.status !== 200 || !response.data || !response.data.MediaContainer || !response.data.MediaContainer.Metadata) return null;
    
    const sessions = response.data.MediaContainer.Metadata;
    if (sessions.length === 0) return null;

    const session = sessions[0];
    if (session.type === 'episode') {
      return { title: session.title, show: session.grandparentTitle, type: 'episode' };
    } else if (session.type === 'movie') {
      return { title: session.title, type: 'movie' };
    } else if (session.type === 'track') {
      return { title: session.title, artist: session.grandparentTitle, type: 'audio' };
    }
    return null;
  } catch (err) {
    console.error('Plex fetch error:', err.message);
    return null;
  }
}

async function fetchGithubActivity(username, apiKey) {
  if (!username || !apiKey) return null;
  try {
    const response = await axios.get(`https://api.github.com/users/${encodeURIComponent(username)}/events/public`, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.data && response.data.length > 0) {
      const recentEvent = response.data[0];
      // Only consider it "active" if it was pushed within the last 2 hours
      const eventTime = new Date(recentEvent.created_at);
      const isRecent = (new Date() - eventTime) < (2 * 60 * 60 * 1000); 

      if (isRecent && recentEvent.type === 'PushEvent') {
        const repoName = recentEvent.repo.name.split('/').pop();
        return { game: repoName, song: repoName, artist: 'Coding on GitHub' };
      }
    }
    return null;
  } catch (err) {
    console.error('GitHub fetch error', err.response?.data || err.message);
    return null;
  }
}

async function fetchXboxPresence(xstsToken, userHash) {
  if (!xstsToken || !userHash) return null;
  try {
    const response = await xboxApi.call(
      { url: 'https://userpresence.xboxlive.com/users/me', method: 'GET' },
      { userHash, XSTSToken: xstsToken },
      3
    );

    if (response && response.state === 'Online' && response.devices && response.devices.length > 0) {
      const activeDevice = response.devices.find(d => d.titles && d.titles.length > 0);
      if (activeDevice) {
        const title = activeDevice.titles[0];
        if (title.name && title.state === 'Active') {
          return { game: title.name, song: title.name, artist: 'Xbox Live' };
        }
      }
    }
    return null;
  } catch (err) {
    console.error('Xbox presence fetch error', err.message);
    return null;
  }
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

async function processUser(userId, user) {
  if (!user.slackToken || user.enabled === false) return;
  if (!user.spotifyRefreshToken && !user.lastFmUsername && !user.steamId && !user.xboxXstsToken && !user.githubUsername && !user.traktUsername && !user.hackatimeAccessToken && !user.jellyfinUrl) return;

  try {
    const activeSources = user.dataSources || (user.dataSource ? [user.dataSource] : ['spotify']);
    
    const fetchPromises = activeSources.map(async (source) => {
      try {
        if (source === 'lastfm' && user.lastFmUsername) return { source, track: await fetchLastFmTrack(user.lastFmUsername, user.lastFmPlayCount, user.lastFmApiKey) };
        if (source === 'steam' && user.steamId) return { source, track: await fetchSteamGame(user.steamId, user.steamApiKey) };
        if (source === 'xbox' && user.xboxXstsToken) return { source, track: await fetchXboxPresence(user.xboxXstsToken, user.xboxUserHash) };
        if (source === 'github' && user.githubUsername) return { source, track: await fetchGithubActivity(user.githubUsername, GITHUB_API_KEY) };
        if (source === 'trakt' && user.traktAccessToken) return { source, track: await fetchTraktWatching(user.traktAccessToken) };
        if (source === 'jellyfin' && user.jellyfinUrl && user.jellyfinApiKey && user.jellyfinUsername) return { source, track: await fetchJellyfinActivity(user.jellyfinUrl, user.jellyfinApiKey, user.jellyfinUsername) };
        if (source === 'plex' && user.plexUrl && user.plexToken) return { source, track: await fetchPlexActivity(user.plexUrl, user.plexToken) };
        if (source === 'lichess' && user.lichessUsername) return { source, track: await fetchLichessActivity(user.lichessUsername) };
        if (source === 'chesscom' && user.chesscomUsername) return { source, track: await fetchChessComActivity(user.chesscomUsername) };
        if (source === 'duolingo' && user.duolingoUsername) return { source, track: await fetchDuolingoActivity(user.duolingoUsername) };
        if (source === 'wakatime' && user.hackatimeAccessToken) return { source, track: await fetchWakatimeActivity(user.hackatimeAccessToken) };
        if (source === 'spotify' && user.spotifyRefreshToken) {
          const accessToken = await fetchSpotifyToken(user.spotifyRefreshToken);
          return { source, track: await fetchCurrentTrack(accessToken) };
        }
      } catch (e) {
        console.error(`Fetch error for ${source}:`, e.message);
      }
      return { source, track: null };
    });

    const results = await Promise.all(fetchPromises);
    const activeTracks = results.filter(r => r && r.track);
    const clearOnPause = user.clearOnPause !== false;

    if (activeTracks.length > 0) {
      let text = '';
      let emoji = user.statusEmoji || defaultEmoji;
      let targetPfp = user.defaultPfp || null;
      const displayMode = user.displayMode || 'cycle';

      if (displayMode === 'combined') {
        const texts = activeTracks.map(current => {
          if (current.source === 'spotify' || current.source === 'lastfm') return `${current.track.song} - ${current.track.artist}${current.track.playcount ? ` (${current.track.playcount} plays)` : ''}`;
          if (current.source === 'steam') return `Playing ${current.track.game}`;
          if (current.source === 'wakatime') return `Coding in ${current.track.language}`;
          if (current.source === 'trakt' || current.source === 'jellyfin') return `Watching ${current.track.show || current.track.title}`;
          if (current.source === 'plex') {
            if (current.track.type === 'episode') return `Watching ${current.track.show} - ${current.track.title}`;
            if (current.track.type === 'movie') return `Watching ${current.track.title}`;
            if (current.track.type === 'audio') return `Listening to ${current.track.title} - ${current.track.artist}`;
          }
          if (current.source === 'lichess') return `Playing ${current.track.gameType} vs ${current.track.opponent}`;
          if (current.source === 'chesscom') return `Playing Chess`;
          if (current.source === 'duolingo') return `Learning ${current.track.currentLanguage} (🔥 ${current.track.streak} days)`;
          return '';
        }).filter(t => t.length > 0);
        
        text = texts.join(' | ');

        if (activeTracks[0]) {
          const first = activeTracks[0];
          if (user[`${first.source}Emoji`]) emoji = user[`${first.source}Emoji`];
          if (user[`${first.source}Pfp`]) targetPfp = user[`${first.source}Pfp`];
        }
      } else {
        let cycleIndex = user.cycleIndex || 0;
        if (cycleIndex >= activeTracks.length) cycleIndex = 0;
        const current = activeTracks[cycleIndex];
        
        const cycleSpeed = user.cycleSpeed || 10;
        const lastCycleTime = user.lastCycleTime || 0;
        const now = Date.now();
        
        if (now - lastCycleTime >= cycleSpeed * 1000) {
          const nextCycleIndex = (cycleIndex + 1) % activeTracks.length;
          db.saveUser(userId, { cycleIndex: nextCycleIndex, lastCycleTime: now });
        }
        
        if (current.source === 'spotify' || current.source === 'lastfm') {
          text = `${current.track.song} - ${current.track.artist}${current.track.playcount ? ` (${current.track.playcount} plays)` : ''}`;
        } else if (current.source === 'steam') {
          text = `Playing ${current.track.game}`;
          if (!user[`steamEmoji`]) emoji = ':video_game:';
        } else if (current.source === 'wakatime') {
          text = `Coding in ${current.track.language}`;
          if (!user[`wakatimeEmoji`]) emoji = ':computer:';
        } else if (current.source === 'trakt' || current.source === 'jellyfin') {
          text = `Watching ${current.track.show || current.track.title}`;
          if (!user[`${current.source}Emoji`]) emoji = ':tv:';
        } else if (current.source === 'plex') {
          if (current.track.type === 'episode') text = `Watching ${current.track.show} - ${current.track.title}`;
          else if (current.track.type === 'movie') text = `Watching ${current.track.title}`;
          else if (current.track.type === 'audio') text = `Listening to ${current.track.title} - ${current.track.artist}`;
          if (!user[`plexEmoji`]) emoji = current.track.type === 'audio' ? ':headphones:' : ':tv:';
        } else if (current.source === 'lichess') {
          text = `Playing ${current.track.gameType} vs ${current.track.opponent}`;
          if (!user[`lichessEmoji`]) emoji = ':chess_pawn:';
        } else if (current.source === 'chesscom') {
          text = `Playing Chess`;
          if (!user[`chesscomEmoji`]) emoji = ':chess_pawn:';
        } else if (current.source === 'duolingo') {
          text = `Learning ${current.track.currentLanguage} (🔥 ${current.track.streak} days)`;
          if (!user[`duolingoEmoji`]) emoji = ':owl:';
        }

        if (user[`${current.source}Emoji`]) emoji = user[`${current.source}Emoji`];
        if (user[`${current.source}Pfp`]) targetPfp = user[`${current.source}Pfp`];

        if (activeSources.length === 1 && user.statusFormat) {
          text = user.statusFormat
            .replace('{song}', current.track.song || '')
            .replace('{artist}', current.track.artist || '')
            .replace('{album}', current.track.album || '')
            .replace('{game}', current.track.game || '')
            .replace('{show}', current.track.show || '')
            .replace('{title}', current.track.title || '')
            .replace('{project}', current.track.project || '')
            .replace('{language}', current.track.language || '');
        }
      }

      if (emoji.includes(',')) {
        const emojis = emoji.split(',').map(e => e.trim()).filter(e => e.length > 0);
        if (emojis.length > 0) {
          emoji = emojis[Math.floor(Math.random() * emojis.length)];
        }
      }
        
      if (text.length > maxLen) {
        text = text.substring(0, maxLen - 1) + '…';
      }

      if (text !== user.lastTrack) {
        await updateSlackStatus(user.slackToken, text, emoji);
        db.saveUser(userId, { lastTrack: text });
      }

      if (targetPfp && targetPfp !== user.lastPfpUrl) {
        await setProfilePicture(user.slackToken, targetPfp);
        db.saveUser(userId, { lastPfpUrl: targetPfp });
      }

    } else if (clearOnPause) {
      if (user.lastTrack) {
        await updateSlackStatus(user.slackToken, '', '');
        db.saveUser(userId, { lastTrack: null });
      }
      if (user.defaultPfp && user.defaultPfp !== user.lastPfpUrl) {
        await setProfilePicture(user.slackToken, user.defaultPfp);
        db.saveUser(userId, { lastPfpUrl: user.defaultPfp });
      }
    }
  } catch (err) {
    console.error(`Error for user ${userId}:`, err.message);
  }
}

async function runPoll() {
  const users = db.getAllUsers();
  for (const userId of Object.keys(users)) {
    await processUser(userId, users[userId]);
  }
}

(async () => {
  await slackApp.start();
  server.listen(port, () => console.log(`listening on :${port}`));
  runPoll();
  setInterval(runPoll, pollInterval);
})();
