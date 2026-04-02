import { NextRequest, NextResponse } from "next/server"

const PROJECT_ID = "barbu-sportif-ai-center"
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || `${PROJECT_ID}-files`

async function getAccessToken(): Promise<string> {
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    )
    if (res.ok) {
      const data = await res.json()
      return data.access_token
    }
  } catch {
    // Not on GCE/Cloud Run
  }
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN
  }
  throw new Error("Cannot obtain access token")
}

export interface GCSFile {
  name: string
  bucket: string
  size: string
  contentType: string
  updated: string
  selfLink: string
  mediaLink: string
}

// GET - List files from GCS bucket
export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get("prefix") || ""
  const delimiter = req.nextUrl.searchParams.get("delimiter") || "/"

  try {
    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch {
      // Preview mode: return mock data
      return NextResponse.json({
        files: [
          {
            name: "documentos/manual-barbusportif.pdf",
            bucket: BUCKET_NAME,
            size: "2457600",
            contentType: "application/pdf",
            updated: new Date().toISOString(),
            selfLink: "#",
            mediaLink: "#",
          },
          {
            name: "imagenes/logo-barbu.png",
            bucket: BUCKET_NAME,
            size: "156000",
            contentType: "image/png",
            updated: new Date().toISOString(),
            selfLink: "#",
            mediaLink: "#",
          },
          {
            name: "videos/demo-producto.mp4",
            bucket: BUCKET_NAME,
            size: "15728640",
            contentType: "video/mp4",
            updated: new Date().toISOString(),
            selfLink: "#",
            mediaLink: "#",
          },
          {
            name: "audio/podcast-ep1.mp3",
            bucket: BUCKET_NAME,
            size: "8388608",
            contentType: "audio/mpeg",
            updated: new Date().toISOString(),
            selfLink: "#",
            mediaLink: "#",
          },
        ],
        folders: ["documentos/", "imagenes/", "videos/", "audio/", "generados/"],
      })
    }

    const params = new URLSearchParams({
      prefix,
      delimiter,
      maxResults: "100",
    })

    const res = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error("GCS list error:", res.status, errText)
      throw new Error(`GCS list failed: ${res.status}`)
    }

    const data = await res.json()
    const files: GCSFile[] = (data.items || [])
      
      .filter((item: any) => !item.name.endsWith("/"))
      
      .map((item: any) => ({
        name: item.name,
        bucket: item.bucket,
        size: item.size,
        contentType: item.contentType || "application/octet-stream",
        updated: item.updated,
        selfLink: item.selfLink,
        mediaLink: item.mediaLink,
      }))

    const folders: string[] = data.prefixes || []

    return NextResponse.json({ files, folders })
  } catch (error) {
    console.error("Files API error:", error)
    return NextResponse.json(
      { error: "Failed to list files", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}

// POST - Upload file to GCS bucket
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fileName, mimeType, data: base64Data } = body

    if (!fileName || !base64Data) {
      return NextResponse.json({ error: "fileName and data required" }, { status: 400 })
    }

    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch {
      return NextResponse.json({
        success: true,
        message: "Preview mode - file would be uploaded to GCS",
        fileName,
      })
    }

    const buffer = Buffer.from(base64Data, "base64")

    const uploadRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(fileName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": mimeType || "application/octet-stream",
        },
        body: buffer,
      }
    )

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      throw new Error(`Upload failed: ${uploadRes.status} - ${errText}`)
    }

    const result = await uploadRes.json()
    return NextResponse.json({ success: true, file: result })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: "Upload failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    )
  }
}
