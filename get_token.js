// One-time script to get a Spotify refresh token via OAuth.
// Run with: node get_token.js
// Then open http://localhost:8888/login in your browser.

require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 8888;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-currently-playing';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

app.get('/login', (_req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
      }
    );

    const { access_token, refresh_token } = response.data;

    console.log('\n--- Authorization successful ---');
    console.log('Access Token: ', access_token);
    console.log('Refresh Token:', refresh_token);
    console.log('\nPaste the refresh token into SPOTIFY_REFRESH_TOKEN in .env');
    console.log('-------------------------------\n');

    res.send(`
      <html>
        <head><title>Spotify Token</title>
          <style>
            body { font-family: sans-serif; background: #191414; color: #fff;
                   display: flex; justify-content: center; align-items: center;
                   min-height: 100vh; margin: 0; }
            .card { background: #282828; border-radius: 12px; padding: 2rem 2.5rem;
                    max-width: 600px; width: 90%; }
            h1 { color: #1DB954; margin-top: 0; }
            code { display: block; background: #121212; padding: 1rem;
                   border-radius: 8px; word-break: break-all; margin: 1rem 0;
                   font-size: 0.85rem; color: #1DB954; }
            p { color: #b3b3b3; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Success</h1>
            <p><strong>Your Refresh Token:</strong></p>
            <code>${refresh_token}</code>
            <p>Copy this and paste it into <strong>SPOTIFY_REFRESH_TOKEN</strong> in your .env file.
               Then stop this server (Ctrl+C) and start the bot with <code style="display:inline;padding:2px 6px;margin:0;">node index.js</code>.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Token exchange failed:', err.response?.data || err.message);
    res.status(500).send('Token exchange failed. Check your terminal for details.');
  }
});

app.listen(PORT, () => {
  console.log(`Token helper running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/login to begin.`);
});
