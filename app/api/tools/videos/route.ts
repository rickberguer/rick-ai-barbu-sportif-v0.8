import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION = "us-central1";

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
    // Not on GCE/Cloud Run
  }
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  throw new Error("Cannot obtain access token.");
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch {
      return NextResponse.json({
        status: "preview",
        fallbackText:
          `**Modo vista previa** - La generacion de video requiere Cloud Run con Vertex AI Veo.\n\n` +
          `Prompt recibido: "${prompt}"`,
      });
    }

    // Veo 3 uses the long-running operations pattern
    // Step 1: Start the generation
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/veo-3.0-generate-preview:predictLongRunning`;

    const startRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds: 8,
          personGeneration: "allow_all",
          generateAudio: true,
        },
      }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error("Veo API error:", startRes.status, errText);
      throw new Error(`Veo API returned ${startRes.status}`);
    }

    const startData = await startRes.json();
    const operationName = startData.name;

    if (!operationName) {
      throw new Error("No operation name returned from Veo API");
    }

    // Step 2: Poll for completion (max ~3 minutes)
    const pollUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/${operationName}`;
    let videoData = null;
    const maxPolls = 60; // 60 * 5s = 5 minutes

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();

      if (pollData.done) {
        videoData = pollData.response;
        break;
      }
    }

    if (!videoData) {
      return NextResponse.json({
        status: "processing",
        operationName,
        fallbackText: "El video se esta generando. Esto puede tomar unos minutos...",
      });
    }

    // Extract video results
    const videos =
      videoData.predictions?.map(
        (pred: { bytesBase64Encoded: string; mimeType?: string }, i: number) => ({
          base64: pred.bytesBase64Encoded,
          mimeType: pred.mimeType || "video/mp4",
          name: `generated-video-${i + 1}.mp4`,
        })
      ) ?? [];

    return NextResponse.json({ status: "complete", videos });
  } catch (error) {
    console.error("Video generation error:", error);
    return NextResponse.json(
      { error: "Error generating video", details: (error as Error).message },
      { status: 500 }
    );
  }
}
