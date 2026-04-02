import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION = "us-central1";

async function getAccessToken(): Promise<string> {
  try {
    const res = await fetch(
      "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
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
    const { prompt, count = 1 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch {
      // Mock for preview
      return NextResponse.json({
        images: [],
        fallbackText:
          `**Modo vista previa** - La generacion de imagenes requiere Cloud Run con Vertex AI Imagen.\n\n` +
          `Prompt recibido: "${prompt}"`,
      });
    }

    // Vertex AI Imagen 3 endpoint
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagen-3.0-generate-002:predict`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: Math.min(count, 4),
          aspectRatio: "1:1",
          personGeneration: "allow_all",
          safetyFilterLevel: "block_few",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Imagen API error:", res.status, errText);
      throw new Error(`Imagen API returned ${res.status}`);
    }

    const data = await res.json();
    const images =
      data.predictions?.map(
        (pred: { bytesBase64Encoded: string; mimeType?: string }, i: number) => ({
          base64: pred.bytesBase64Encoded,
          mimeType: pred.mimeType || "image/png",
          name: `generated-image-${i + 1}.png`,
        })
      ) ?? [];

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Error generating image", details: (error as Error).message },
      { status: 500 }
    );
  }
}
