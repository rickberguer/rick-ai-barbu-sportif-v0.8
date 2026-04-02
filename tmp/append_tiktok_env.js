const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const appendData = `
# TikTok Business API
TIKTOK_APP_ID=7620298737047912449
TIKTOK_SECRET=96d9c53adfdf4ec26fe31c87680e7dceedf1f14f
TIKTOK_REDIRECT_URI=https://ai.barbusportif.ca/api/auth/tiktok/callback
`;

fs.appendFileSync(envPath, appendData);
console.log("TikTok variables appended to .env.local");
