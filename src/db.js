const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../data/users.json');

const DATA_DIR = path.dirname(DB_FILE);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize DB if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf8');
}

function getAllUsers() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB:', err);
    return {};
  }
}

function getUser(slackUserId) {
  const users = getAllUsers();
  return users[slackUserId] || null;
}

function saveUser(slackUserId, data) {
  const users = getAllUsers();
  users[slackUserId] = {
    ...users[slackUserId],
    ...data,
  };
  
  if (users[slackUserId].enabled === undefined) {
    users[slackUserId].enabled = true;
  }
  
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function deleteUser(slackUserId) {
  const users = getAllUsers();
  if (users[slackUserId]) {
    delete users[slackUserId];
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
  }
}

module.exports = {
  getAllUsers,
  getUser,
  saveUser,
  deleteUser,
};
