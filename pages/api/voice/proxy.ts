import { NextApiRequest, NextApiResponse } from "next";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { GoogleAuth } from "google-auth-library";
import { auth } from "@/lib/firebase-admin";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION   = "us-central1";
const LIVE_MODEL = "gemini-3.1-flash-lite-preview";

// Deshabilita el body parser de Next.js para permitir la conexión en crudo (raw socket)
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

const WS_URL = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;

// Cachea el wss globalmente para no reiniciarlo en cada petición
let wss: WebSocketServer | undefined;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const server = (res.socket as any).server;

  if (!server.wss) {
    console.log("[voice-proxy] Inicializando WebSocket Server...");
    wss = new WebSocketServer({ noServer: true });
    server.wss = wss;

    // Enganchamos el evento upgrade del servidor HTTP subyacente
    server.on("upgrade", (request: any, socket: any, head: any) => {
      if (request.url?.startsWith("/api/voice/proxy")) {
        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit("connection", ws, request);
        });
      }
    });

    wss.on("connection", async (frontendWs, request) => {
      console.log("[voice-proxy] Nueva conexión desde el frontend");

      // El browser WebSocket no acepta header Authorization,
      // así que extraemos el token de la query param.
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const fbToken = url.searchParams.get("token");

      if (!fbToken) {
        frontendWs.close(1008, "Missing Firebase token");
        return;
      }

      try {
        await auth.verifyIdToken(fbToken);
      } catch (e) {
        frontendWs.close(1008, "Invalid Firebase token");
        return;
      }

      // Obtenemos Token ADC (Application Default Credentials)
      let accessToken = "";
      try {
         const metaRes = await fetch("http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token", {
            headers: { "Metadata-Flavor": "Google" }, cache: "no-store"
         });
         if (metaRes.ok) {
            accessToken = (await metaRes.json()).access_token;
            console.log("[voice-proxy] Token obtenido vía GCE Metadata Server");
         } else {
             throw new Error();
         }
      } catch {
         try {
             const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
             const tokenRes = await client.getAccessToken();
             if (tokenRes.token) {
                 accessToken = tokenRes.token;
                 console.log("[voice-proxy] Token obtenido vía google-auth-library");
             }
         } catch {
             if (process.env.GOOGLE_ACCESS_TOKEN) {
                 accessToken = process.env.GOOGLE_ACCESS_TOKEN;
                 console.log("[voice-proxy] Token obtenido vía GOOGLE_ACCESS_TOKEN");
             }
         }
      }

      if (!accessToken) {
         console.error("[voice-proxy] Fallo al obtener el token ADC.");
         frontendWs.close(1008, "No se pudo obtener token de GCP.");
         return;
      }

      console.log("[voice-proxy] Abriendo túnel hacia Vertex AI...");
      const vertexWs = new WSWebSocket(WS_URL, {
         headers: {
            "Authorization": `Bearer ${accessToken}`
         }
      });

      vertexWs.on("open", () => {
         console.log("[voice-proxy] Túnel con Vertex AI abierto ✓");

         // Enviar Setup Config como regla 3 de forma estricta.
         const contextStr = url.searchParams.get("context") || "";
         
         const textPrompt = `Eres Rick, el socio técnico y audaz de Barbu Sportif. Responde rápido y de forma concisa basándote en los datos visuales de la barbería.` + 
           (contextStr ? `\n\n[Panel actual del usuario: ${contextStr}]` : "");

         const setupMsg = {
           setup: {
             model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${LIVE_MODEL}`,
             generationConfig: {
               responseModalities: ["AUDIO"],
               speechConfig: {
                 voiceConfig: {
                   prebuiltVoiceConfig: {
                     voiceName: "Enceladus"
                   }
                 }
               }
             },
             systemInstruction: {
               parts: [{ text: textPrompt }]
             }
           }
         };
         
         vertexWs.send(JSON.stringify(setupMsg));
         
         // No necesitamos mandar setup al frontend ya que vertex manda un msg.setupComplete.
      });

      vertexWs.on("message", (data) => {
         if (frontendWs.readyState === WSWebSocket.OPEN) {
            frontendWs.send(data);
         }
      });

      frontendWs.on("message", (data) => {
         if (vertexWs.readyState === WSWebSocket.OPEN) {
            vertexWs.send(data);
         }
      });

      vertexWs.on("close", (code, reason) => {
         console.log(`[voice-proxy] Vertex WS cerrado (${code}) ${reason}`);
         if (frontendWs.readyState === WSWebSocket.OPEN) frontendWs.close(code, reason);
      });

      frontendWs.on("close", () => {
         console.log("[voice-proxy] Frontend WS cerrado");
         if (vertexWs.readyState === WSWebSocket.OPEN) vertexWs.close();
      });

      vertexWs.on("error", (err) => {
         console.error("[voice-proxy] Error en Vertex WS:", err);
         if (frontendWs.readyState === WSWebSocket.OPEN) frontendWs.close(1011, "Error desde Vertex API");
      });

      frontendWs.on("error", (err) => {
         console.error("[voice-proxy] Error en Frontend WS:", err);
         if (vertexWs.readyState === WSWebSocket.OPEN) vertexWs.close();
      });

    });
  }

  // Responder a la solicitud GET normal para engañar a Next.js y permitir el upgrade después.
  res.status(200).send("WebSocket Proxy initialized and listening for upgrades.");
}
