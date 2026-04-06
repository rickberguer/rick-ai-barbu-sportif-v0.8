const fs = require('fs');
const obj = JSON.parse(fs.readFileSync('cloudrun_env_clean.json', 'utf8'));
const valString = obj.val; // This is the string from process.env...

const driveCreds = JSON.parse(valString);
console.log("Parsed client_email:", driveCreds.client_email);

let pk = driveCreds.private_key;
console.log("Has actual newline characters?", pk.includes('\n') ? "YES" : "NO");
console.log("Has literal backslash n?", pk.includes('\\n') ? "YES" : "NO");

const fixed = pk.replace(/\\n/g, '\n');
console.log("After replace(/\\\\n/g, '\\n'):");
console.log("Has actual newline characters?", fixed.includes('\n') ? "YES" : "NO");
console.log("Has literal backslash n?", fixed.includes('\\n') ? "YES" : "NO");

const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({
    credentials: {
      type: driveCreds.type,
      project_id: driveCreds.project_id,
      private_key_id: driveCreds.private_key_id,
      private_key: fixed,
      client_email: driveCreds.client_email,
      client_id: driveCreds.client_id,
    },
    scopes: "https://www.googleapis.com/auth/cloud-platform"
});

auth.getClient()
  .then(() => console.log("SUCCESS loading credentials!"))
  .catch(e => console.error("CLIENT ERROR:", e));
