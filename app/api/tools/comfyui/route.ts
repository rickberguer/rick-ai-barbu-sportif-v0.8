import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

export const maxDuration = 300; // 5 minutos aprox (Límite en Vercel Pro), en Cloud Run respetará timeouts más altos.

const COMFYUI_BASE_URL = "https://cloud.comfy.org";

// Carga estática de Workflows JSON. Asegúrate de que estos archivos existan en tu directorio de origen.
import txt2imgTemplate from "@/comfyui-workflows/txt2img_workflow.json";
import txt2vidTemplate from "@/comfyui-workflows/txt2vid_workflow.json";
import img2imgTemplate from "@/comfyui-workflows/img2img_workflow.json";
import img2vidTemplate from "@/comfyui-workflows/img2vid_workflow.json";

// --- Interfaces Tipadas ---
export type ActionType = "txt2img" | "txt2vid" | "img2img" | "img2vid";

interface ComfyUIRequestPayload {
  action_type: ActionType;
  positive_prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  reference_image_url?: string;
}

interface ComfyJobStatusResponse {
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
}

interface ComfyHistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  videos?: Array<{ filename: string; subfolder: string; type: string }>;
  gifs?: Array<{ filename: string; subfolder: string; type: string }>;
}

interface ComfyHistoryResponse {
  history: {
    [prompt_id: string]: {
      outputs: {
        [node_id: string]: ComfyHistoryOutput;
      };
    };
  };
}

/**
 * Autenticación de Google Drive v3
 */
async function getDriveService() {
  const credentialsString = process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if (!credentialsString) throw new Error("Falta la variable DRIVE_SERVICE_ACCOUNT_JSON en el servidor.");
  const credentials = JSON.parse(credentialsString);

  const authClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Función Auxiliar para parsear Aspect Ratio (ej. "16:9") a píxeles. Valores Base: 1024x1024
 */
function getDimensionsFromRatio(ratio?: string): { width: number; height: number } {
  if (!ratio) return { width: 1024, height: 1024 };
  const parts = ratio.split(":");
  if (parts.length !== 2) return { width: 1024, height: 1024 };

  const wRatio = parseFloat(parts[0]);
  const hRatio = parseFloat(parts[1]);
  if (isNaN(wRatio) || isNaN(hRatio) || hRatio === 0) return { width: 1024, height: 1024 };

  // Base 1 Megapixel (SDXL/Flux base dimensions)
  const basePixels = 1024 * 1024;
  const height = Math.round(Math.sqrt(basePixels / (wRatio / hRatio)));
  const width = Math.round(height * (wRatio / hRatio));

  // Asegurar múltiplos de 8
  return {
    width: Math.floor(width / 8) * 8,
    height: Math.floor(height / 8) * 8,
  };
}

export async function POST(req: NextRequest) {
  try {
    const COMFYUI_API_KEY = process.env.COMFYUI_CLOUD_API_KEY;
    const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "root";

    if (!COMFYUI_API_KEY) {
      console.error("[Cráter de Configuración] Falta la API Key de ComfyUI Cloud en las variables de entorno (COMFYUI_CLOUD_API_KEY).");
      return NextResponse.json(
        { success: false, error: "Error de Servidor: Falta credencial de ComfyUI." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ComfyUIRequestPayload;
    const { action_type, positive_prompt, negative_prompt = "", aspect_ratio, reference_image_url } = body;

    // 1. VALIDACIÓN
    if (!action_type || !positive_prompt) {
      return NextResponse.json(
        { success: false, error: "action_type y positive_prompt son estrictamente obligatorios." },
        { status: 400 }
      );
    }

    if ((action_type === "img2img" || action_type === "img2vid") && !reference_image_url) {
      return NextResponse.json(
        { success: false, error: "Si action_type incluye 'img', reference_image_url es estrictamente obligatorio." },
        { status: 400 }
      );
    }

    // 2. CARGA DE WORKFLOW Y VARIABLES
    let templateBase: any;
    let expectedMediaType: "image" | "video";

    switch (action_type) {
      case "txt2img":
        templateBase = txt2imgTemplate;
        expectedMediaType = "image";
        break;
      case "txt2vid":
        templateBase = txt2vidTemplate;
        expectedMediaType = "video";
        break;
      case "img2img":
        templateBase = img2imgTemplate;
        expectedMediaType = "image";
        break;
      case "img2vid":
        templateBase = img2vidTemplate;
        expectedMediaType = "video";
        break;
      default:
        return NextResponse.json(
          { success: false, error: "action_type inválido." },
          { status: 400 }
        );
    }

    // Deep Copy del JSON para poder inyectarle valores libremente
    const workflowData = JSON.parse(JSON.stringify(templateBase));
    let uploadedImageName = "";

    // 3. FASE 1: PREPARACIÓN Y SUBIDA DE IMAGEN (Solo para flujos img)
    if (reference_image_url && (action_type === "img2img" || action_type === "img2vid")) {
      console.log(`[ComfyUI Cloud] Descargando imagen de referencia: ${reference_image_url}`);

      const imgRes = await fetch(reference_image_url);
      if (!imgRes.ok) throw new Error("Error al descargar la imagen de referencia: " + imgRes.status);

      const imgBuffer = await imgRes.arrayBuffer();
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";

      const formData = new FormData();
      // Usamos el constructor de Blob estándar disponible en Next.js
      const imgBlob = new Blob([imgBuffer], { type: contentType });
      const randomId = Math.random().toString(36).substring(7);
      formData.append("image", imgBlob, `upload_${randomId}.jpg`);

      console.log(`[ComfyUI Cloud] Subiendo imagen a la nube...`);
      const uploadRes = await fetch(`${COMFYUI_BASE_URL}/api/upload/image`, {
        method: "POST",
        headers: {
          "X-API-Key": COMFYUI_API_KEY,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const upErr = await uploadRes.text();
        throw new Error(`Error al subir imagen a ComfyUI: ${uploadRes.status} - ${upErr}`);
      }

      const uploadData = await uploadRes.json();
      uploadedImageName = uploadData.name || uploadData.filename;
      if (!uploadedImageName) throw new Error("Respuesta de subida inesperada (no se encontró nombre de archivo).");

      console.log(`[ComfyUI Cloud] Imagen inyectada correctamente como: ${uploadedImageName}`);
    }

    // 4. FASE 2: INYECCIÓN DINÁMICA DE NODOS
    // Autodetección inteligente de los nodos clave iterando por las clases y títulos.
    const targetDims = getDimensionsFromRatio(aspect_ratio);
    const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

    try {
      Object.values(workflowData).forEach((node: any) => {
        const classType = node.class_type || "";
        const title = (node._meta && node._meta.title) ? node._meta.title.toLowerCase() : "";
        const inputs = node.inputs || {};

        // 1. INYECCIÓN DE IMAGEN DE REFERENCIA
        if (classType === "LoadImage" && uploadedImageName) {
          if (inputs.image !== undefined) inputs.image = uploadedImageName;
        }

        // 2. INYECCIÓN DE PROMPTS
        if (classType.includes("TextEncode") || classType.includes("CLIPTextEncode")) {
          // Detectamos por título para saber si es Positivo o Negativo
          if (title.includes("negative")) {
            if (inputs.text !== undefined) inputs.text = negative_prompt;
            if (inputs.prompt !== undefined) inputs.prompt = negative_prompt;
          } else if (title.includes("positive")) {
            if (inputs.text !== undefined) inputs.text = positive_prompt;
            if (inputs.prompt !== undefined) inputs.prompt = positive_prompt;
          } else {
            // Si el nodo negativo tiene el nombre genérico, usamos heurística sobre su estado inicial vacío
            if (classType === "TextEncodeQwenImageEditPlus" && !title.includes("positive") && inputs.prompt === "") {
              inputs.prompt = negative_prompt;
            }
          }
        }

        // 3. INYECCIÓN DE DIMENSIONES Y ASPECT RATIOS
        if (
          classType === "EmptyLatentImage" ||
          classType === "EmptySD3LatentImage" ||
          classType === "EmptyHunyuanLatentVideo" ||
          classType === "WanImageToVideo"
        ) {
          if (inputs.width !== undefined) inputs.width = targetDims.width;
          if (inputs.height !== undefined) inputs.height = targetDims.height;
        }

        // 4. INYECCIÓN DE SEMILLAS (SEEDS) PARA VARIABILIDAD Y RUIDO
        if (classType.includes("Sampler")) {
          if (inputs.seed !== undefined) {
            inputs.seed = randomSeed;
          }
          if (inputs.noise_seed !== undefined) {
            // En Advanced Samplers, solo inyectamos en el que añade ruido para no romper encadenamientos
            if (inputs.add_noise === "enable" || inputs.add_noise === undefined) {
              inputs.noise_seed = randomSeed;
            }
          }
        }
      });
    } catch (injErr) {
      console.warn("Error algorítmico al inyectar dinámicamente los nodos del workflow:", injErr);
    }

    // 5. FASE 3: EJECUCIÓN DEL JOB Y POLLING (Larga duración)
    console.log(`[ComfyUI Cloud] Lanzando Job de tipo [${action_type}]...`);
    const promptRes = await fetch(`${COMFYUI_BASE_URL}/api/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": COMFYUI_API_KEY,
      },
      body: JSON.stringify({ prompt: workflowData }),
    });

    if (!promptRes.ok) {
      const perr = await promptRes.text();
      throw new Error(`Error en el Request Job: ${promptRes.status} - ${perr}`);
    }

    const { prompt_id } = await promptRes.json();
    console.log(`[ComfyUI Cloud] Job ID asignado: ${prompt_id}. Comenzando Polling (Timeout: 15 min)...`);

    const TIMEOUT_MS = 15 * 60 * 1000; // 900 Segundos recomendados para Video Generators pesados.
    const startTime = Date.now();
    let isCompleted = false;

    while (!isCompleted) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        throw new Error("Job Timeout: Se excedieron los 15 minutos en Cloud Run. Tarea abortada por seguridad.");
      }

      const statusRes = await fetch(`${COMFYUI_BASE_URL}/api/job/${prompt_id}/status`, {
        headers: { "X-API-Key": COMFYUI_API_KEY },
      });

      if (!statusRes.ok) throw new Error("Fallo de red conectando al Job Status de ComfyUI.");

      const statusData = (await statusRes.json()) as ComfyJobStatusResponse;

      if (statusData.status === "completed") {
        isCompleted = true;
      } else if (statusData.status === "failed" || statusData.status === "cancelled") {
        throw new Error(`El trabajo falló prematuramente; estado reportado: ${statusData.status}.`);
      } else {
        // Pausar y esperar el próximo pull asíncrono.
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log(`[ComfyUI Cloud] Job completado. Revisando nodos de salida en la Historia...`);

    // 6. FASE 4: EXTRACCIÓN Y DESCARGA
    const historyRes = await fetch(`${COMFYUI_BASE_URL}/api/history_v2/${prompt_id}`, {
      headers: { "X-API-Key": COMFYUI_API_KEY },
    });

    if (!historyRes.ok) throw new Error("Error interno extrayendo la Historia V2 del nodo.");

    const historyData = (await historyRes.json()) as ComfyHistoryResponse;
    const outputs = historyData.history[prompt_id]?.outputs;

    if (!outputs) throw new Error("No hay outputs generados. El workflow podría haber finalizado mudo.");

    let targetArchivo = "";
    Object.values(outputs).forEach((nodeOutput) => {
      // Prioridad: Videos > GIFs > Imágenes
      if (nodeOutput.videos && nodeOutput.videos.length > 0) {
        targetArchivo = nodeOutput.videos[0].filename;
      } else if (nodeOutput.gifs && nodeOutput.gifs.length > 0 && !targetArchivo) {
        targetArchivo = nodeOutput.gifs[0].filename;
      } else if (nodeOutput.images && nodeOutput.images.length > 0 && !targetArchivo) {
        targetArchivo = nodeOutput.images[0].filename;
      }
    });

    if (!targetArchivo) {
      throw new Error(`El output iterado no arrojó identificadores multimedia válidos (video, gif, image).`);
    }

    console.log(`[ComfyUI Cloud] Media extraído de memoria cache: ${targetArchivo}. Descargando a Buffer Node...`);

    const viewUrl = `${COMFYUI_BASE_URL}/api/view?filename=${encodeURIComponent(targetArchivo)}&subfolder=&type=output`;
    const downloadRes = await fetch(viewUrl, {
      headers: { "X-API-Key": COMFYUI_API_KEY },
      redirect: "follow", // Follow the S3 presigned URL automatically.
    });

    if (!downloadRes.ok) throw new Error(`El proxy HTTP bloqueó o no encontró el archivo: ${downloadRes.status}`);

    const fileBuffer = await downloadRes.arrayBuffer();

    // 7. FASE 5: CLASIFICACIÓN DE BUFFER Y ALMACENAMIENTO PERMANENTE A GOOGLE DRIVE V3
    const extension = targetArchivo.split(".").pop()?.toLowerCase() || "";
    let systemMime = "application/octet-stream";
    if (["png", "jpeg", "jpg", "webp"].includes(extension)) systemMime = `image/${extension}`;
    else if (["mp4", "webm"].includes(extension)) systemMime = `video/${extension}`;
    else systemMime = expectedMediaType === "video" ? "video/mp4" : "image/png";

    const nodeStream = new Readable();
    nodeStream.push(Buffer.from(fileBuffer));
    nodeStream.push(null);

    const driveService = await getDriveService();
    const gDriveRes = await driveService.files.create({
      requestBody: {
        name: `AI_${action_type}_${prompt_id}_${targetArchivo}`,
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: systemMime,
        body: nodeStream,
      },
      fields: "id, webViewLink, webContentLink",
      supportsAllDrives: true, // Asegurar acceso a Shared Drives si aplica
    });

    const fileId = gDriveRes.data.id;
    if (!fileId) throw new Error("Google Drive no devolvió un Identifier válido durante el File Create.");

    await driveService.permissions.create({
      fileId: fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    // 8. FASE FINAL: RETORNO DE CÓDIGO
    return NextResponse.json({
      success: true,
      mediaUrl: gDriveRes.data.webViewLink,
      mediaType: expectedMediaType,
      actionType: action_type,
    });

  } catch (error: any) {
    console.error(`[Cráter Crítico - ComfyUI AI Tools]:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error fatal no controlado durante la generación multimedia.",
      },
      { status: 500 }
    );
  }
}
