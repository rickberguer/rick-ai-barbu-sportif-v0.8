import { NextApiRequest, NextApiResponse } from "next";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";

/**
 * GET /api/vision/ws-proxy  (con upgrade a WebSocket)
 *
 * Proxy WebSocket server-side entre el navegador y el GPU server.
 * El navegador se conecta aquí (same-origin, sin Cloudflare Access).
 * Este handler abre una segunda conexión WS hacia el GPU añadiendo
 * los headers CF-Access-Client-Id / CF-Access-Client-Secret desde
 * variables de entorno del servidor — nunca expuestas al cliente.
 *
 * Patrón idéntico al de pages/api/voice/proxy.ts (ya funciona en prod).
 *
 * Cloud Run soporta WebSocket hasta 3600s por request — suficiente para
 * una sesión de monitoreo de cámaras; el cliente tiene reconexión automática.
 */

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

let wss: WebSocketServer | undefined;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const server = (res.socket as any)?.server;
  if (!server) {
    res.status(500).end("No HTTP server available");
    return;
  }

  if (!server.visionWss) {
    console.log("[vision-ws-proxy] Inicializando WebSocket Server...");
    wss = new WebSocketServer({ noServer: true });
    server.visionWss = wss;

    server.on("upgrade", (request: any, socket: any, head: any) => {
      if (request.url?.startsWith("/api/vision/ws-proxy")) {
        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit("connection", ws, request);
        });
      }
    });

    wss.on("connection", (frontendWs: WSWebSocket) => {
      const gpuUrl = process.env.VISION_GPU_URL || "";
      const cfClientId = process.env.CF_CLIENT_ID;
      const cfClientSecret = process.env.CF_CLIENT_SECRET;

      if (!gpuUrl || !cfClientId || !cfClientSecret) {
        console.error("[vision-ws-proxy] Configuración incompleta — cerrando conexión");
        frontendWs.close(1011, "Server misconfiguration");
        return;
      }

      const gpuWsUrl =
        gpuUrl.replace("https://", "wss://").replace("http://", "ws://") +
        "/ws/detections";

      console.log(`[vision-ws-proxy] Abriendo túnel → ${gpuWsUrl}`);

      const gpuWs = new WSWebSocket(gpuWsUrl, {
        headers: {
          "CF-Access-Client-Id": cfClientId,
          "CF-Access-Client-Secret": cfClientSecret,
        },
      });

      gpuWs.on("open", () => {
        console.log("[vision-ws-proxy] Túnel con GPU abierto ✓");
      });

      // GPU → navegador (detecciones en tiempo real)
      gpuWs.on("message", (data) => {
        if (frontendWs.readyState === WSWebSocket.OPEN) {
          frontendWs.send(data);
        }
      });

      // Navegador → GPU (keepalive / mensajes futuros)
      frontendWs.on("message", (data) => {
        if (gpuWs.readyState === WSWebSocket.OPEN) {
          gpuWs.send(data);
        }
      });

      gpuWs.on("close", (code, reason) => {
        console.log(`[vision-ws-proxy] GPU WS cerrado (${code}) ${reason}`);
        if (frontendWs.readyState === WSWebSocket.OPEN) {
          frontendWs.close(code, reason);
        }
      });

      frontendWs.on("close", () => {
        console.log("[vision-ws-proxy] Frontend WS cerrado");
        if (gpuWs.readyState === WSWebSocket.OPEN) gpuWs.close();
      });

      gpuWs.on("error", (err) => {
        console.error("[vision-ws-proxy] Error GPU WS:", err.message);
        if (frontendWs.readyState === WSWebSocket.OPEN) {
          frontendWs.close(1011, "GPU connection error");
        }
      });

      frontendWs.on("error", (err) => {
        console.error("[vision-ws-proxy] Error frontend WS:", err.message);
        if (gpuWs.readyState === WSWebSocket.OPEN) gpuWs.close();
      });
    });
  }

  // Respuesta HTTP inicial — Next.js requiere esto para permitir el upgrade posterior
  res.status(200).send("Vision WebSocket proxy ready.");
}
