const fs = require('fs');
const obj = JSON.parse(fs.readFileSync('cloudrun_env_clean.json', 'utf8'));
const valString = obj.val; 

const driveCreds = JSON.parse(valString);
const pk = driveCreds.private_key.replace(/\\n/g, '\n');

const { google } = require('googleapis');

const authClient = new google.auth.JWT({
  email: driveCreds.client_email,
  key: pk,
  scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose'
  ],
  subject: "info@barbusportif.ca"
});

const gmail = google.gmail({ version: 'v1', auth: authClient });

console.log("Requesting gmail...");
gmail.users.messages.list({ userId: 'me', maxResults: 1 })
  .then(res => {
    console.log("Success! Messages:", res.data);
  })
  .catch(err => {
    console.error("GMAIL API ERROR!");
    console.error(err);
  });
