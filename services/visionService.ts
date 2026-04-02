/**
 * Captures the latest frame from a camera URL using Cloudflare Access credentials.
 * @param cameraUrl The URL of the JPG stream from the camera.
 * @returns Base64 encoded string of the capture image.
 */
export async function getLatestFrame(cameraUrl: string): Promise<string> {
  const clientId = process.env.CF_CLIENT_ID;
  const clientSecret = process.env.CF_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Cloudflare Access credentials not found in environment variables.');
  }

  const response = await fetch(cameraUrl, {
    headers: {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
    },
    cache: 'no-store', // Always fetch fresh frame
  });

  if (!response.ok) {
    throw new Error(`Failed to capture frame from vision camera: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return base64;
}

// --- CONFIGURACIÓN DE MODELO GEMINI V3 (SIGUIENDO CHAT/ROUTE.TS) ---
const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION_VERTEX = "global";
const GEMINI_MODEL = "gemini-3-flash-preview";

import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

async function getAccessToken(): Promise<string> {
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error('Token is undefined');
    return token.token;
  } catch (error: any) {
    console.warn("[Vision Service] No se pudo obtener el token automático:", error.message);
    if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
    throw error;
  }
}

export async function analyzeFrame(base64Image: string) {
  const accessToken = await getAccessToken();
  const baseUrl = LOCATION_VERTEX === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${LOCATION_VERTEX}-aiplatform.googleapis.com`;

  const url = `${baseUrl}/v1/projects/${PROJECT_ID}/locations/${LOCATION_VERTEX}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const prompt = `
    Analyze this image of a barber shop. 
    Identify every person and every barber chair in the image.
    For each person, determine if they are a 'barber' or a 'client'.
    For each barber chair, determine if it is 'occupied' or 'empty'.
    
    Return a structured JSON object:
    {
      "people": [{ "type": "barber" | "client", "box_2d": [y1, x1, y2, x2] }],
      "chairs": [{ "status": "occupied" | "empty", "box_2d": [y1, x1, y2, x2] }],
      "summary": { "total_barbers": number, "total_clients": number, "occupied_chairs": number }
    }
  `;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
      ],
    }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vertex AI Manual Fetch Error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleanJson = responseText.replace(/```json|```/g, '').trim();
  
  return JSON.parse(cleanJson);
}
