import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

async function getSheetsClient() {
  const authJson = process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if (!authJson) throw new Error("DRIVE_SERVICE_ACCOUNT_JSON not found");

  const credentials = JSON.parse(authJson);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return google.sheets({ version: "v4", auth });
}

export async function getSheetData(spreadsheetId: string, range: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return res.data.values || [];
}
export async function listSheets(spreadsheetId: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
  });
  return res.data.sheets || [];
}

export async function getCashReportData(filterDate?: string, lastWithdrawalDates: Record<string, string> = {}) {
  const SHEET_ID = process.env.CASH_REPORT_SHEET_ID || "";
  if (!SHEET_ID) throw new Error("CASH_REPORT_SHEET_ID not set");

  const allSheets = await listSheets(SHEET_ID);
  const aggregated: Record<string, any> = {};

  await Promise.all(allSheets.map(async (sheet: any) => {
    const title = sheet.properties.title;
    if (title.toLowerCase().includes("resumen") || title.toLowerCase().includes("template")) return;

    try {
      const rows = await getSheetData(SHEET_ID, `${title}!A1:Z1000`);
      if (!rows || rows.length < 2) return;

      const headers = rows[0].map((h: string) => h.toLowerCase().trim().replace(/ /g, "_"));
      
      const nameIdx = headers.indexOf("sucursal");
      const autoIdx = headers.indexOf("depot");
      const reelIdx = headers.indexOf("depot_reel");
      const shortIdx = headers.indexOf("short_over");
      const dateIdx = headers.indexOf("date") !== -1 ? headers.indexOf("date") : headers.indexOf("fecha");

      const finalNameIdx = nameIdx !== -1 ? nameIdx : headers.findIndex(h => h.includes("sucur") || h.includes("name"));
      const finalAutoIdx = autoIdx !== -1 ? autoIdx : headers.findIndex(h => h.includes("depot") && !h.includes("reel"));
      const finalReelIdx = reelIdx !== -1 ? reelIdx : headers.findIndex(h => h.includes("depot_reel"));
      const finalShortIdx = shortIdx !== -1 ? shortIdx : headers.findIndex(h => h.includes("short") || h.includes("over"));
      const finalDateIdx = dateIdx !== -1 ? dateIdx : 0;

      const dataRows = rows.slice(1);

      // Calcular acumulado
      const runningAccumulated: Record<string, number> = {};
      
      dataRows.forEach((row: any[]) => {
        let nameRaw = row[finalNameIdx] || title;
        let pName = nameRaw.trim();
        if (pName.toLowerCase().includes("ndp")) pName = "Notre-Dame-des-Prairies";

        const rowDate = row[finalDateIdx] || "";
        const normRowDate = rowDate.includes('/') ? rowDate.split('/').reverse().join('-') : rowDate;
        const lastWithDate = lastWithdrawalDates[pName];

        const isAfterWithdrawal = !lastWithDate || normRowDate > lastWithDate || rowDate > lastWithDate;

        if (isAfterWithdrawal) {
          const reelVal = parseFloat((row[finalReelIdx] || "0").toString().replace(/[^0-9.-]+/g, "")) || 0;
          runningAccumulated[pName] = (runningAccumulated[pName] || 0) + reelVal;
        }
      });

      dataRows.forEach((row: any[]) => {
        let nameRaw = row[finalNameIdx] || title;
        let name = nameRaw.trim();
        
        if (name.toLowerCase().includes("ndp")) {
          name = "Notre-Dame-des-Prairies";
        }

        const rowDate = row[finalDateIdx] || "";
        const normRowDate = rowDate.includes('/') ? rowDate.split('/').reverse().join('-') : rowDate;
        const matchesDate = !filterDate || normRowDate.includes(filterDate) || rowDate.includes(filterDate);

        if (matchesDate) {
          aggregated[name] = {
            name,
            depotAuto: row[finalAutoIdx] || "0",
            depotReel: row[finalReelIdx] || "0",
            shortOver: row[finalShortIdx] || "0",
            date: rowDate,
            accumulated: runningAccumulated[name] || 0
          };
        }
      });
    } catch (e) {
      console.error(`Error fetching sheet ${title}:`, e);
    }
  }));

  return Object.values(aggregated);
}
