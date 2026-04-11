// app/api/voice/token/route.ts
// Devuelve un token OAuth de corta duración para conectar al Live API de Vertex AI.
// Protegido por Firebase ID token.
//
// ENDPOINT: Vertex AI BidiGenerateContent (OAuth Bearer, no API key)
//   wss://LOCATION-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent
//   Auth: ?access_token=OAUTH_TOKEN  (Google OAuth 2.0 §2.3 — soportado por todas las APIs de Google)
//
// Cadena de obtención del token (en orden):
//   1. GCE Metadata Server (Cloud Run ADC — producción)
//   2. google-auth-library ADC (gcloud auth application-default login — dev local con gcloud)
//   3. GOOGLE_ACCESS_TOKEN env var (fallback dev local / CI)

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION   = "us-central1";
const LIVE_MODEL = "gemini-3.1-flash-lite-preview";

export const MODEL_RESOURCE =
  `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${LIVE_MODEL}`;

export const WS_URL =
  `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;

// ─── Token OAuth (cadena de prioridad) ───────────────────────────────────────

async function getAccessToken(): Promise<string> {
  // 1. GCE Metadata Server → Cloud Run ADC (producción)
  try {
    const res = await fetch(
      "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      console.log("[voice/token] ✓ Token via Metadata Server (Cloud Run ADC)");
      return data.access_token;
    }
  } catch { /* no estamos en GCE */ }

  // 2. google-auth-library ADC (dev local con `gcloud auth application-default login`)
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const client     = await new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    }).getClient();
    const tokenRes = await client.getAccessToken();
    if (tokenRes.token) {
      console.log("[voice/token] ✓ Token via google-auth-library ADC");
      return tokenRes.token;
    }
  } catch { /* ADC no configurado */ }

  // 3. Variable de entorno GOOGLE_ACCESS_TOKEN (fallback dev local / CI)
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    console.log("[voice/token] ✓ Token via GOOGLE_ACCESS_TOKEN env var");
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  throw new Error(
    "No se pudo obtener token OAuth. " +
    "En local: ejecuta `gcloud auth application-default login` o setea GOOGLE_ACCESS_TOKEN. " +
    "En Cloud Run: verifica que el Service Account tenga el rol Vertex AI User."
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Verificar Firebase ID token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await auth.verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
  }

  // 2. Obtener token OAuth
  try {
    const accessToken = await getAccessToken();
    return NextResponse.json({
      token:    accessToken,   // usado como ?access_token= en el WebSocket
      model:    MODEL_RESOURCE,
      wsUrl:    WS_URL,
      location: LOCATION,
      project:  PROJECT_ID,
    });
  } catch (e: any) {
    console.error("[voice/token] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
