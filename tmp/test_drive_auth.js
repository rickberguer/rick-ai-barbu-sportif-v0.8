const { google } = require('googleapis');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function getDriveServiceOld() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  return google.drive({ version: "v3", auth });
}

async function getDriveServiceNew() {
  const credentialsString = process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if (!credentialsString) throw new Error("Falta la variable DRIVE_SERVICE_ACCOUNT_JSON en el servidor.");
  const credentials = JSON.parse(credentialsString);

  const authClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth: authClient });
}

async function run() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  console.log("GOOGLE_DRIVE_FOLDER_ID:", folderId);

  try {
    console.log("Testing Old Auth...");
    const driveOld = await getDriveServiceOld();
    // Try listing files in that folder
    const resOld = await driveOld.files.list({
      q: `'${folderId}' in parents`,
      pageSize: 1,
    });
    console.log("Old Auth Success, files found:", resOld.data.files.length);
  } catch (err) {
    console.error("Old Auth Failed:", err.message);
  }

  try {
    console.log("\nTesting New Auth...");
    const driveNew = await getDriveServiceNew();
    const resNew = await driveNew.files.list({
      q: `'${folderId}' in parents`,
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    console.log("New Auth Success, files found:", resNew.data.files.length);
  } catch (err) {
    console.error("New Auth Failed:", err.message);
  }
}

run();
