import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

async function getDriveClient() {
  const authJson = process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if (!authJson) throw new Error("DRIVE_SERVICE_ACCOUNT_JSON not found");

  const credentials = JSON.parse(authJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return google.drive({ version: "v3", auth });
}

export async function listDriveFiles(folderId: string) {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, size, createdTime, webViewLink, iconLink, thumbnailLink)",
    orderBy: "createdTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return res.data.files || [];
}

export async function renameDriveFile(fileId: string, newName: string) {
  const drive = await getDriveClient();
  await drive.files.update({
    fileId,
    requestBody: { name: newName },
    supportsAllDrives: true,
  });
}

export async function deleteDriveFile(fileId: string) {
  const drive = await getDriveClient();
  await drive.files.delete({ 
    fileId,
    supportsAllDrives: true,
  });
}
