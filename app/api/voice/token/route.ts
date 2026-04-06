// app/api/voice/token/route.ts
// Returns a short-lived Vertex AI Bearer token for the Live API WebSocket.
// The token is fetched from the GCE Metadata Server (Cloud Run ADC).
// Protected by Firebase ID token verification.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION = "us-central1";
// The Live API requires the full publisher model path
const LIVE_MODEL = "gemini-3.1-flash-live-preview";
export const MODEL_RESOURCE = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${LIVE_MODEL}`;

async function getAccessToken(): Promise<string> {
  // 1. GCE Metadata Server (Cloud Run ADC)
  try {
    console.log("[voice/token] Trying GCE Metadata Server...");
    const res = await fetch(
      "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      console.log("[voice/token] ADC token obtained via Metadata Server.");
      return data.access_token;
    }
    console.error("[voice/token] Metadata Server responded non-OK:", res.status);
  } catch (e) {
    console.error("[voice/token] Metadata Server unreachable:", e);
  }

  // 2. Static env var fallback (local dev)
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    console.log("[voice/token] Using GOOGLE_ACCESS_TOKEN from env.");
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  throw new Error("ADC token unavailable: metadata server failed and GOOGLE_ACCESS_TOKEN not set.");
}

export async function GET(req: NextRequest) {
  // 1. Verify Firebase ID token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.error("[voice/token] Missing Authorization header.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await auth.verifyIdToken(authHeader.split("Bearer ")[1]);
  } catch (e) {
    console.error("[voice/token] Firebase token verification failed:", e);
    return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
  }

  // 2. Get ADC token
  try {
    const accessToken = await getAccessToken();
    return NextResponse.json({
      token: accessToken,
      model: MODEL_RESOURCE,
      location: LOCATION,
      project: PROJECT_ID,
      wsUrl: `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`,
    });
  } catch (e: any) {
    console.error("[voice/token] Failed to obtain ADC token:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
