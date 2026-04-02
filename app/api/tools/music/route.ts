import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION = "us-central1";
// Actualizamos al motor musical de última generación (Lyria 3)
const MUSIC_MODEL = "lyria-3.0-generate-001";

async function getAccessToken(): Promise<string> {
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
  } catch {
    // Fallback para entornos locales
  }
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  throw new Error("No se pudo obtener el token de acceso.");
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "El prompt es obligatorio." }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch {
      return NextResponse.json({
        status: "preview",
        fallbackText: `**Modo vista previa** - Requiere Cloud Run.\nPrompt: "${prompt}"`,
      });
    }

    // Endpoint de Lyria 3 para operaciones largas (LRO)
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MUSIC_MODEL}:predictLongRunning`;

    const startRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          durationSeconds: 30, // Lyria 3 genera pistas estándar de 30s
          includeSynthID: true // Requisito de marca de agua de seguridad
        },
      }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error("Error en la API de Lyria:", startRes.status, errText);
      throw new Error(`Lyria API devolvió ${startRes.status}`);
    }

    const startData = await startRes.json();
    const operationName = startData.name;

    if (!operationName) {
      throw new Error("La API no devolvió un ID de operación válido.");
    }

    // Polling optimizado: Máximo ~90 segundos (Para no superar el límite de Cloud Run)
    const pollUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/${operationName}`;
    let musicData = null;
    const maxPolls = 18; // 18 intentos x 5 segundos = 90 segundos

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 5000)); // Espera 5 segundos

      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();

      if (pollData.done) {
        if (pollData.error) {
          throw new Error(`Error en la generación: ${pollData.error.message}`);
        }
        musicData = pollData.response;
        break;
      }
    }

    // Si pasaron los 90 segundos y no terminó, le avisamos al frontend
    if (!musicData) {
      return NextResponse.json({
        status: "processing",
        operationName,
        message: "La pista de música es compleja y sigue generándose. Por favor revisa en unos momentos.",
      }, { status: 202 }); // 202 Accepted (Procesando)
    }

    // Extraemos las pistas generadas en Base64
    const tracks = musicData.predictions?.map(
      (pred: { bytesBase64Encoded: string; mimeType?: string }, i: number) => ({
        base64: pred.bytesBase64Encoded,
        mimeType: pred.mimeType || "audio/mpeg",
        name: `barbu-track-${i + 1}.mp3`,
      })
    ) ?? [];

    return NextResponse.json({ status: "complete", tracks });

  } catch (error) {
    console.error("Error al generar música:", error);
    return NextResponse.json(
      { error: "Fallo al generar la pista de música", details: (error as Error).message },
      { status: 500 }
    );
  }
}