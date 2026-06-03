require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function setup() {
  try {
    const res = await axios.get('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` }
    });
    
    if (res.data.ok) {
      const slackUserId = res.data.user_id;
      const dbPath = './data/users.json';
      
      let users = {};
      if (fs.existsSync(dbPath)) {
        users = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }
      
      users[slackUserId] = {
        slackToken: process.env.SLACK_USER_TOKEN,
        spotifyRefreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
        lastTrack: null
      };
      
      fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
      console.log('Successfully seeded database for user:', slackUserId);
    }
  } catch (err) {
    console.error(err);
  }
}

setup();
