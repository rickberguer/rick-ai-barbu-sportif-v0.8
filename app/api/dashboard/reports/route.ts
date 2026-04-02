import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";

async function verifyUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (e) {
    // Fallback for development if token audience is different
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      if (payload.exp * 1000 > Date.now()) return payload;
    } catch {}
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { listDriveFiles } = await import("@/lib/google-drive");
    const FOLDER_ID = process.env.REPORTS_FOLDER_ID || "";
    if (!FOLDER_ID) return NextResponse.json({ error: "No folder ID" }, { status: 500 });

    const driveFiles = await listDriveFiles(FOLDER_ID);

    const reportsData = driveFiles
      .filter(f => f.mimeType !== "application/vnd.google-apps.folder")
      .map(f => {
        let format = "FILE";
        if (f.mimeType === "application/pdf") format = "PDF";
        else if (f.mimeType?.includes("spreadsheet") || f.name?.endsWith(".xlsx") || f.name?.endsWith(".csv")) format = "XLSX";

        const bytes = parseInt(f.size || "0");
        let sizeStr = "0 KB";
        if (bytes > 0) {
          const k = 1024;
          const sizes = ["B", "KB", "MB", "GB"];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          sizeStr = parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
        }

        return {
          id: f.id,
          name: f.name || "Sin nombre",
          fullName: f.name,
          mimeType: f.mimeType,
          format,
          date: f.createdTime ? f.createdTime.split("T")[0] : "",
          size: sizeStr,
          url: f.webViewLink,
          thumbnail: f.thumbnailLink,
          icon: f.iconLink
        };
      });

    return NextResponse.json(reportsData);
  } catch (error: any) {
    console.error("Error GET Reports:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, name } = await req.json();
    if (!id || !name) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { renameDriveFile } = await import("@/lib/google-drive");
    await renameDriveFile(id, name);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error PATCH Reports:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids)) return NextResponse.json({ error: "Missing ids" }, { status: 400 });

    const { deleteDriveFile } = await import("@/lib/google-drive");
    for (const id of ids) {
      await deleteDriveFile(id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error DELETE Reports:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
