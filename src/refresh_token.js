import dotenv from 'dotenv';
import express from 'express';
import open from 'open';
import path from 'path';
import { google } from 'googleapis';

// dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); // only for dev env should be commented for prod

const app = express();

console.log()

console.log(process.env.GOOGLE_CLIENT_ID)
console.log(process.env.GOOGLE_CLIENT_SECRET)
console.log(process.env.GOOGLE_REDIRECT_URI)

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 1️⃣ Generate Auth URL
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // important to get refresh token
  scope: SCOPES,
  prompt: 'consent select_account',      // forces consent screen to get refresh token
});

console.log('Opening browser for Google login...');
open(authUrl);

// 2️⃣ Handle OAuth redirect
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code found in query');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Show the tokens to copy
    res.send(`
      <h3>Authorization complete!</h3>
      <p>Copy this refresh token for your automation:</p>
      <pre>${tokens.refresh_token}</pre>
    `);

    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token); // save this securely
    process.exit(0); // exit server after getting token
  } catch (err) {
    console.error('Error retrieving tokens:', err);
    res.send('Error retrieving tokens');
  }
});

// Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('Waiting for Google OAuth redirect...');
});
