// app/api/chat/route.ts
import { runFullStrategicAnalysis } from "@/lib/analysis-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/firebase-admin";
import { getCashReportData } from "@/lib/google-sheets";
import { createScheduledTask } from "@/lib/scheduler";

// --- IMPORTACIONES DE TUS "CEREBROS" ---
import { searchDriveFiles, getDriveFileForAI, saveToCorporateMemory } from "@/lib/drive";
import { readRecentEmails, draftEmail, searchEmails } from "@/lib/mail";
import { checkProductStock, getRecentOrders, getSalesReport } from "@/lib/woo";
import { getTrafficSummary, getTopPages } from "@/lib/matomo";
import { getDomainOverview, getTopKeywords, getKeywordIdeas, getSiteAuditOverview } from "@/lib/semrush";
import { searchWeb } from "@/lib/tavily";
import { queryBigQuery } from "@/lib/bigquery";
import { generateAndUploadPDF } from "@/lib/pdf";
import { getFigmaDesignAsImage } from "@/lib/figma";
import { sendMailgunEmail } from "@/lib/mailgun";
import { getLookerReportUrls } from "@/lib/looker";
import { getTikTokCampaignStats } from "@/lib/tiktok";

// --- CONFIGURATION ---
const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION_VERTEX = "global";
const LOCATION_DATA = "global";

const DATA_STORE_IDS: string[] = [
  "barbudrive_1771909028081",
  "barbusiteweb_1771908645468",
  "rick-data2_1772644923446"
];

// Supported MIME types for Gemini multimodal
const SUPPORTED_IMAGE_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif",
];
const SUPPORTED_AUDIO_TYPES = [
  "audio/wav", "audio/mp3", "audio/mpeg", "audio/aiff", "audio/aac",
  "audio/ogg", "audio/flac", "audio/webm", "audio/m4a", "audio/mp4", "audio/x-m4a",
];
const SUPPORTED_VIDEO_TYPES = [
  "video/mp4", "video/mpeg", "video/mov", "video/avi", "video/wmv", "video/webm", "video/quicktime",
];
const SUPPORTED_DOC_TYPES = [
  "application/pdf", "text/plain", "text/csv", "text/html",
];

function isSupportedMimeType(mime: string): boolean {
  return [
    ...SUPPORTED_IMAGE_TYPES,
    ...SUPPORTED_AUDIO_TYPES,
    ...SUPPORTED_VIDEO_TYPES,
    ...SUPPORTED_DOC_TYPES,
  ].includes(mime);
}

// --- ADC Access Token via GCE Metadata Server (Cloud Run) ---
async function getAccessToken(): Promise<string> {
  try {
    // BLINDAJE: Usamos la IP directa (169.254.169.254) en lugar del dominio para evitar fallos de DNS IPv6 en Node.js
    const res = await fetch(
      "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
  } catch (error) {
    console.error("Fallo al contactar Metadata Server local:", error);
  }

  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  throw new Error(
    "Cannot obtain access token. Deploy on Cloud Run with ADC or set GOOGLE_ACCESS_TOKEN env var."
  );
}

interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}


type GeminiPart = Record<string, any>;

export async function POST(req: NextRequest) {
  try {
    // -----------------------------------------------------------
    // --- CAPA DE SEGURIDAD ---
    // -----------------------------------------------------------
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Acceso denegado. Faltan credenciales." },
        { status: 401 }
      );
    }

    const idToken = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (error) {
      console.error("Error verificando el token de Firebase:", error);
      return NextResponse.json(
        { error: "Token inválido o expirado. Por favor, inicia sesión de nuevo." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const { message, attachments, history, modelSelected = "rapido", thinkingLevel = "low", locale = "es", panelContext, chatId } = body as {
      message: string;
      attachments?: Attachment[];
      history?: ChatHistoryMessage[];
      modelSelected?: string;
      thinkingLevel?: "low" | "high";
      locale?: "fr" | "en" | "es";
      panelContext?: string;
      chatId?: string;
    };

    if (!message && (!attachments || attachments.length === 0)) {
      return NextResponse.json(
        { error: "Se requiere un mensaje o un archivo adjunto." },
        { status: 400 }
      );
    }

    // 2. Asignamos la versión exacta de Gemini v3 según la elección
    let GEMINI_MODEL = "gemini-3-flash-preview";
    // Motor por defecto (Rápido)
    if (modelSelected === "pro") {
      GEMINI_MODEL = "gemini-3.1-pro-preview";
      // Motor Pro
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch {
      return NextResponse.json({
        response:
          "**Modo de vista previa** - La conexion con Vertex AI requiere despliegue en Cloud Run con ADC habilitado. " +
          "El mensaje que enviaste fue:\n\n> " +
          (message || "(solo archivos adjuntos)") +
          (attachments && attachments.length > 0
            ? `\n\nArchivos adjuntos: ${attachments.map((a) => a.name).join(", ")}`
            : ""),
      });
    }

    // -----------------------------------------------------------
    // 1. BUILD MULTIMODAL PARTS FOR GEMINI
    // -----------------------------------------------------------
    const userParts: GeminiPart[] = [];
    if (message) {
      userParts.push({ text: `Pregunta: ${message}` });
    }

    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (!isSupportedMimeType(attachment.mimeType)) {
          userParts.push({
            text: `[Archivo adjunto: ${attachment.name} (${attachment.mimeType}) - formato no soportado para analisis directo]`,
          });
          continue;
        }

        userParts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data.includes(",") ? attachment.data.split(",")[1] : attachment.data,
          },
        });
        if (SUPPORTED_AUDIO_TYPES.includes(attachment.mimeType)) {
          userParts.push({ text: `[Audio adjunto: "${attachment.name}". Escucha y responde.]` });
        } else if (SUPPORTED_IMAGE_TYPES.includes(attachment.mimeType)) {
          userParts.push({ text: `[Imagen adjunta: "${attachment.name}". Analiza y describe.]` });
        } else if (SUPPORTED_VIDEO_TYPES.includes(attachment.mimeType)) {
          userParts.push({ text: `[Video adjunto: "${attachment.name}". Analiza su contenido.]` });
        } else if (SUPPORTED_DOC_TYPES.includes(attachment.mimeType)) {
          userParts.push({ text: `[Documento adjunto: "${attachment.name}". Lee y analiza el contenido.]` });
        }
      }
    }

    // -----------------------------------------------------------
    // 2. BUILD CONVERSATION HISTORY
    // -----------------------------------------------------------
    const historyContents = history?.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })) ?? [];

    // -----------------------------------------------------------
    // 3. GENERATE WITH GEMINI (Vertex AI REST API)
    // -----------------------------------------------------------
    const quebecTime = new Date().toLocaleString("es-MX", {
      timeZone: "America/Toronto",
      dateStyle: "full",
      timeStyle: "long"
    });

    const panelExtraCtx = panelContext && panelContext !== 'chat'
      ? `\n[CONTEXTO DE INTERFAZ ACTUAL]\nEl usuario esta viendo actualmente el panel de: ${panelContext.toUpperCase()}. Si hace preguntas relativas a "lo que estoy viendo", asume que se refiere a los datos de este panel.`
      : "";

    const systemPrompt = `
Eres Rick, el Director Operativo Virtual (vCOO) de la cadena Barbu Sportif. Tu misión es liderar la gestión operativa, financiera y creativa de las sucursales en Quebec con una mentalidad estratégica, directa y orientada a resultados.

[CONTEXTO OPERATIVO]
- Hora actual (Quebec): ${quebecTime}
- Visibilidad Actual: ${panelExtraCtx || "Panel de Chat General"}.
- Dashboard de Inventario: Tienes acceso visual a un desglose detallado de stock por sucursal. Si el usuario pregunta "qué hay en inventario", puedes apoyarte en el dashboard o BigQuery.

[JERARQUÍA DE DATOS (REGLAS DE ORO)]
1. BIGQUERY ES LA ÚNICA VERDAD: Mindbody se sincroniza cada 30 min. NO tienes acceso a su API directa. Para TODA consulta operativa (ventas, citas, nóminas, etc.), usa 'consultar_datos_bigquery'.
2. MARKETING: Todo el gasto de pauta (Google/Meta) reside en BigQuery.

[INGENIERÍA SQL (ESTRÍCTO)]
1. FECHAS (ANTI-CRASH):
   - Mindbody (\`sale_datetime\`, \`date_time\`) son tipo DATETIME almacenado en UTC.
   - Filtro OBLIGATORIO para esas columnas: \`WHERE DATE(TIMESTAMP(columna), 'America/Toronto') = 'YYYY-MM-DD'\`.
   - Explicación: TIMESTAMP(datetime_col) convierte DATETIME→TIMESTAMP asumiendo UTC, luego DATE(..., timezone) extrae la fecha local. NUNCA uses DATETIME(col, timezone) porque esa firma solo acepta TIMESTAMP como primer argumento.
   - Marketing/Inventory: Estas tablas ya tienen columnas DATE puras (ej. \`date\`, \`inventory_date\`). Filtra directo: \`WHERE date = 'YYYY-MM-DD'\`.
2. IDENTIFICACIÓN DE CLIENTES: 
   - El historial (sales_history/appointment_history) SOLO tiene 'client_id' y 'phone' (si existe). El 'email' vive en 'client_catalog'.
   - Para joins: \`FROM sales_history s LEFT JOIN client_catalog c ON s.client_id = c.client_id\`.
   - Fórmula de identidad unificada: \`COALESCE(NULLIF(c.email, ''), NULLIF(c.phone, ''), CAST(s.client_id AS STRING))\`.
   - Tasa de Retención: (Clientes Recurrentes / Clientes Totales) calculados con esta lógica de identidad.
3. EFICIENCIA DE MEMORIA: Prohibido 'SELECT *'. Usa agregaciones (SUM, COUNT). Agrupa por Mes/Sucursal, NUNCA por IDs transaccionales o timestamps granulares.
4. VENTAS: Clasifica con \`WHERE is_product = true\` para productos y \`false\` para servicios.

[DATASETS Y TABLAS]
1. MINDBODY (\`mindbody_analytics\`): \`sales_history\`, \`appointment_history\`, \`payroll_history\`, \`client_catalog\`, \`vision_analytics\`.
2. INVENTARIO (\`inventory_system\`): 
   - \`daily_stock\`: (inventory_date, store, product_name, quantity, unit_price, total_line_value).
   - Lógica: Para ver el stock real, usa \`ROW_NUMBER() OVER (PARTITION BY store, product_name ORDER BY inventory_date DESC)\` y filtra \`WHERE rn = 1\`.
3. MARKETING: \`Google_ads.CampaignBasicStats_1029563228\`, \`facebook_ads_analytics.campaign_daily_stats\`, \`tiktok_ads_analytics.campaign_daily_stats\`.

[VISUALIZACIÓN Y REPORTES]
1. MERMAID (REGLA DE 0): El eje Y debe empezar en 0: \`y-axis "Etiqueta" 0 --> [Max]\`. No uses símbolos ($), comas ni % en los números de Mermaid.
2. REPORTES MASIVOS: Si el reporte supera las 10 filas, no uses tablas Markdown. Da un resumen ejecutivo detallado y remite al usuario a Looker Studio.
3. LOOKER STUDIO: Si usas 'actualizar_vista_looker', respeta los alias constantes: \`fecha\`, \`categoria\`, \`ingresos\`, \`cantidad\`.
4. PDF PREMIUM: Genera reportes exhaustivos (todas las sucursales) con estética "Apple-neo-glassmorphism dark" y en francés quebequense.

[HABILIDADES ESTRATÉGICAS]
- ANÁLISIS vCOO: Después de cada dato, ofrece contexto, tendencias y 2-3 pasos accionables.
- GUARDIÁN DE MARCA: Evalúa diseños (Figma/Imágenes). Debe ser "Deportivo, Varonil, Moderno". Sin medias tintas: si es genérico o 'spa', pide corrección inmediata.
- CREATIVIDAD GPU: Genera arte/video publicitario en inglés técnico (Cinematic, 8k, RED camera). Para Reels/TikTok usa 'vertical' (resolución 1080x1920) OBLIGATORIAMENTE.
- RICK VISION: Usa 'mirar_sucursal' para conteo de personas y sillas en vivo antes de proponer cambios de turno o promociones.

[PROGRAMANDO EL FUTURO (AUTOMATIZACIÓN)]
- Tienes el poder de agendar tareas recurrentes con 'create_scheduled_automation'. 
- Si el usuario dice "todos los lunes a las 8am analiza X", "avísame diario si Y" o "checa el inventario cada noche", propón una automatización.
- Antes de ejecutar, confirma: "Entendido, voy a programar [Descripción] para ejecutarse cada [Horario]. ¿Confirmas?".
- Sé proactivo: Si ves un problema recurrente, sugiere: "¿Quieres que programe un chequeo automático para esto?".
- Formato Cron: Quebec está en 'America/Toronto'. El Scheduler maneja este timezone automáticamente.

[COMUNICACIÓN]
- SMS (Twilio): Solo para solicitudes explícitas o urgencias. Formato E.164 (+1... o +52...). Tono ultra-directo.
- EMAIL: 'draft_email' para borradores, 'enviar_correo_mailgun' para envíos reales (USA HTML). Firma: Rick vCOO, Barbu Sportif.
`;

    // Herramientas Nativas de RAG (Data Stores)
    const dataStoreTools = DATA_STORE_IDS.map(dsId => ({
      retrieval: {
        vertexAiSearch: {
          datastore: `projects/${PROJECT_ID}/locations/${LOCATION_DATA}/collections/default_collection/dataStores/${dsId}`
        }
      }
    }));

    const driveTools = [
      ...dataStoreTools,
      {
        functionDeclarations: [


          // 🎵 TIKTOK ADS
          {
            name: "get_tiktok_marketing_stats",
            description: "Consulta métricas de rendimiento de campañas de TikTok Ads (spend, clicks, impressions, conversiones) para un periodo de tiempo. Úsalo cuando el usuario pida saber el rendimiento de TikTok.",
            parameters: {
              type: "OBJECT",
              properties: {
                startDate: { type: "STRING", description: "Fecha inicio (YYYY-MM-DD)" },
                endDate: { type: "STRING", description: "Fecha fin (YYYY-MM-DD)" }
              },
              required: ["startDate", "endDate"]
            }
          },

          //LOOKER STUDIO
          {
            name: "actualizar_vista_looker",
            description: "Actualiza una vista específica en BigQuery conectada a una página de Looker Studio. Úsala cuando el usuario pida dashboards o reportes complejos.",
            parameters: {
              type: "OBJECT",
              properties: {
                tipo_reporte: {
                  type: "STRING",
                  description: "Categoría exacta del reporte. Valores permitidos: ventas_servicios, ventas_productos, ventas_totales, rendimiento_barberos, retencion_clientes, reporte_citas, gastos_marketing."
                },
                query: {
                  type: "STRING",
                  description: "Consulta SQL SELECT válida. DEBES usar alias constantes para las columnas (ej. 'fecha', 'barbero', 'ingresos', 'cantidad') para no romper el esquema de Looker Studio."
                }
              },
              required: ["tipo_reporte", "query"],
            },
          },

          //MAILGUN
          {
            name: "enviar_correo_mailgun",
            description: "ENVÍA UN CORREO REAL E INMEDIATO. Úsala cuando el usuario te pida explícitamente enviar un correo, reporte o alerta a una persona. Redacta correos profesionales y corporativos.",
            parameters: {
              type: "OBJECT",
              properties: {
                to: { type: "STRING", description: "El correo electrónico del destinatario." },
                subject: { type: "STRING", description: "El asunto del correo." },
                text: { type: "STRING", description: "El cuerpo del correo en texto plano." },
                html: { type: "STRING", description: "Opcional. El cuerpo del correo formateado en HTML limpio si necesitas enviar tablas o reportes estructurados." }
              },
              required: ["to", "subject", "text"]
            },
          },

          //FIGMA
          {
            name: "analizar_diseno_figma",
            description: "Obtiene la imagen de un diseño de Figma a partir de su enlace. Úsala cuando el usuario te comparta una URL de Figma para que puedas analizar visualmente la interfaz, colores, textos y estructura.",
            parameters: {
              type: "OBJECT",
              properties: {
                figmaUrl: { type: "STRING", description: "La URL completa de Figma que te compartió el usuario." }
              },
              required: ["figmaUrl"]
            },
          },

          // SMS / TWILIO
          {
            name: "enviar_sms_twilio",
            description: "Herramienta que permite enviar mensajes de texto (SMS) reales a los clientes o al staff de la barbería 'Barbu Sportif'. Úsala exclusivamente cuando necesites notificar, recordar una cita, o comunicarte urgentemente. Requiere que el número de destino esté en formato E.164 (Ejemplo: +15145550199 para Canadá/US o +5255... para MX) y un mensaje conciso.",
            parameters: {
              type: "OBJECT",
              properties: {
                to_number: {
                  type: "STRING",
                  description: "El número telefónico de destino en formato internacional E.164. DEBE incluir el signo más (+) seguido del código de país y el número, sin espacios ni guiones. Ejemplo: '+15145550199'.",
                },
                message_body: {
                  type: "STRING",
                  description: "El contenido de texto exacto del SMS a enviar. Debe ser claro, directo y conservar el tono representativo de Barbu Sportif.",
                },
              },
              required: ["to_number", "message_body"],
            },
          },

          // 🎬 MARKETING MULTIMEDIA / COMFYUI
          {
            name: "generar_multimedia_marketing",
            description: "¡Herramienta maestra de Marketing Visual! Úsala ÚNICAMENTE cuando el usuario PIDA ESTRICTAMENTE generar una IMAGEN o un VIDEO publicitario, arte, o contenido visual para redes sociales de la cadena de barberías 'Barbu Sportif'. Produce renders hiperrealistas, fotografía de alta gama y cortos cinematográficos. ESTRICTAMENTE REQUIERE prompts sumamente técnicos, descriptivos, fotorrealistas y EXCLUSIVAMENTE EN INGLÉS.",
            parameters: {
              type: "OBJECT",
              properties: {
                action_type: {
                  type: "STRING",
                  enum: ["txt2img", "txt2vid", "img2img", "img2vid"],
                  description: "1) Si piden crear una imagen desde cero, usa 'txt2img'. 2) Si piden crear un video desde cero, usa 'txt2vid'. 3) Si exigen alterar o cambiar estilo a una foto real existente, usa 'img2img'. 4) Si piden animar o dar vida a una foto estática existente, usa 'img2vid'.",
                },
                positive_prompt: {
                  type: "STRING",
                  description: "Prompt maestral técnico y descriptivo en INGLÉS. OBLIGATORIO: 'Cinematic lighting, hyper-realistic, 8k resolution, shot on RED camera...'",
                },
                negative_prompt: {
                  type: "STRING",
                  description: "Lo que excluyes del render. Ej: 'ugly, deformed, low quality, blurry, watermark, text, out of focus, distorted face'.",
                },
                aspect_ratio: {
                  type: "STRING",
                  enum: ["1:1", "9:16", "16:9"],
                  description: "'1:1' Redes/feed regular. '9:16' (Vertical) OBLIGATORIO para Instagram Reels/TikToks. '16:9' Horizontal web.",
                },
                reference_image_url: {
                  type: "STRING",
                  description: "CRÍTICO! REQUERIDO SI Y SÓLO SI 'action_type' es 'img2img' o 'img2vid'. URL pública y directa a la foto. Vacío o si es txt2img/txt2vid.",
                },
              },
              required: ["action_type", "positive_prompt", "negative_prompt", "aspect_ratio"],
            },
          },

          // 📁 DRIVE
          {
            name: "search_drive_files",
            description: "Busca archivos en el Google Drive de Barbu Sportif.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
          },
          {
            name: "get_drive_file",
            description: "Obtiene el contenido de un archivo de Drive específico.",
            parameters: { type: "OBJECT", properties: { fileId: { type: "STRING" }, mimeType: { type: "STRING" } }, required: ["fileId", "mimeType"] },
          },
          {
            name: "save_to_corporate_memory",
            description: "Guarda un documento en la Memoria Corporativa de la IA.",
            parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, content: { type: "STRING" } }, required: ["title", "content"] },
          },

          // 🛒 WOOCOMMERCE
          {
            name: "check_stock",
            description: "Busca stock y precios en la tienda en línea WooCommerce.",
            parameters: { type: "OBJECT", properties: { search: { type: "STRING" } } },
          },
          {
            name: "get_recent_orders",
            description: "Obtiene los últimos pedidos web.",
            parameters: { type: "OBJECT", properties: { limit: { type: "INTEGER" }, status: { type: "STRING" } } },
          },
          {
            name: "get_sales_report",
            description: "Obtiene resumen financiero de e-commerce.",
            parameters: { type: "OBJECT", properties: {} },
          },

          // 📧 CORREO
          {
            name: "read_recent_emails",
            description: "Lee los correos recientes de la empresa.",
            parameters: { type: "OBJECT", properties: { targetEmail: { type: "STRING" }, limit: { type: "INTEGER" } }, required: ["targetEmail"] },
          },
          {
            name: "draft_email",
            description: "Crea un borrador de correo.",
            parameters: { type: "OBJECT", properties: { targetEmail: { type: "STRING" }, to: { type: "STRING" }, subject: { type: "STRING" }, bodyText: { type: "STRING" } }, required: ["targetEmail", "to", "subject", "bodyText"] },
          },
          {
            name: "search_emails",
            description: "Busca correos históricos.",
            parameters: { type: "OBJECT", properties: { targetEmail: { type: "STRING" }, query: { type: "STRING" } }, required: ["targetEmail", "query"] },
          },

          // 📊 MATOMO ANALYTICS
          {
            name: "get_traffic_summary",
            description: "Obtiene tráfico web desde Matomo.",
            parameters: { type: "OBJECT", properties: { date: { type: "STRING" }, period: { type: "STRING" } } },
          },
          {
            name: "get_top_pages",
            description: "Páginas más visitadas del sitio web.",
            parameters: { type: "OBJECT", properties: { date: { type: "STRING" }, period: { type: "STRING" } } },
          },

          // 🧠 BIGQUERY (EL CEREBRO ANALÍTICO MAESTRO)
          {
            name: "consultar_datos_bigquery",
            description: "Ejecuta SQL nativo en BigQuery. Para datos históricos. ¡REGLA DE ORO!: Las fechas de MINDBODY están en UTC y requieren DATE(DATETIME(nombre_columna, 'America/Toronto')). Las tablas de MARKETING (Google/Meta Ads) son DATE puro, ¡NO USES DATETIME() en ellas!. Consolida métricas en UNA SOLA consulta (subconsultas o JOIN). NUNCA uses 'SELECT *'.",
            parameters: {
              type: "OBJECT",
              properties: { query: { type: "STRING", description: "Consulta SQL SELECT válida. Tablas: mindbody_analytics.sales_history, mindbody_analytics.appointment_history, mindbody_analytics.vision_analytics (historial visión), etc." } },
              required: ["query"],
            },
          },

          // 📈 SEMRUSH & OTROS
          {
            name: "get_domain_overview",
            description: "Obtiene el resumen general de SEO y Tráfico de un dominio.",
            parameters: { type: "OBJECT", properties: { domain: { type: "STRING" }, database: { type: "STRING" } } },
          },
          {
            name: "get_top_keywords",
            description: "Extrae palabras clave de un dominio.",
            parameters: { type: "OBJECT", properties: { domain: { type: "STRING" }, database: { type: "STRING" } }, required: ["domain"] },
          },
          {
            name: "get_keyword_ideas",
            description: "Genera ideas de palabras clave.",
            parameters: { type: "OBJECT", properties: { phrase: { type: "STRING" }, database: { type: "STRING" } }, required: ["phrase"] },
          },
          {
            name: "get_site_audit_overview",
            description: "Obtiene la salud técnica y auditoría SEO del sitio (errores, advertencias, salud).",
            parameters: { type: "OBJECT", properties: {} },
          },
          {
            name: "search_web",
            description: "Busca en internet en tiempo real.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
          },
          {
            name: "generate_pdf_report",
            description: "Genera reporte PDF.",
            parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, htmlContent: { type: "STRING" } }, required: ["title", "htmlContent"] },
          },
          {
            name: "obtener_reporte_cajas",
            description: "Obtiene el reporte de cierres de caja (depósitos, sobrantes/faltantes) desde Google Sheets. Incluye todas las sucursales.",
            parameters: {
              type: "OBJECT",
              properties: {
                date: { type: "STRING", description: "Opcional. Fecha en formato YYYY-MM-DD. Si no se pasa, trae los datos más recientes." }
              }
            },
          },
          {
            name: "ejecutar_analisis_estrategico",
            description: "Rick analiza TODOS los dashboards (Ventas, Tráfico, Marketing, Cajas) para generar 4 nuevas recomendaciones en el panel de Estrategias e IA. Úsalo cuando el usuario pida 'analiza y recomienda' o sugerencias generales.",
            parameters: { type: "OBJECT", properties: {} },
          },

          // 👁️ RICK VISION
          {
            name: "mirar_sucursal",
            description: "Permite acceder a la cámara en vivo de una sucursal específica para contar personas (barberos y clientes) y sillas ocupadas. Úsala para dar reportes de tráfico en tiempo real o verificar el estado de una tienda.",
            parameters: {
              type: "OBJECT",
              properties: {
                branch_name: {
                  type: "STRING",
                  description: "El nombre o ID de la sucursal (mirabel, sauveur, repen, joli, ndp, 3rcentre, aubuchon, quebec, terrebonne, seigneurs, sorel, drummond, victo, shawi, cap)."
                }
              },
              required: ["branch_name"]
            }
          },

          // ⏰ CLOUD SCHEDULER (AUTOMATIZACIÓN RECURRENTE)
          {
            name: "create_scheduled_automation",
            description: "Programa una tarea recurrente o recordatorio en la nube. USA 'delete_after: true' en el payload si es un recordatorio de una sola vez.",
            parameters: {
              type: "OBJECT",
              properties: {
                task_id: { type: "STRING", description: "ID único: 'reminder_tp_mirabel', 'report_weekly', etc." },
                cron_expression: { type: "STRING", description: "Formato cron: '0 8 * * *' (diario 8am), '0 0 * * 1' (lunes medianoche)." },
                task_payload: {
                  type: "OBJECT",
                  description: "Objeto con 'action' (send_sms, summarize_sales), 'target' (sucursal/teléfono), 'message' (texto), y opcionalmente 'delete_after' (boolean)."
                },
                user_description: { type: "STRING", description: "Descripción de la tarea." },
              },
              required: ["task_id", "cron_expression", "task_payload", "user_description"]
            }
          },
          {
            name: "delete_scheduled_automation",
            description: "Elimina una tarea programada existente de Cloud Scheduler usando su task_id.",
            parameters: {
              type: "OBJECT",
              properties: {
                task_id: { type: "STRING", description: "El ID de la tarea a eliminar (ej. 'reminder_tp_mirabel')." }
              },
              required: ["task_id"]
            }
          }
        ],
      }
    ];

    const baseUrl = LOCATION_VERTEX === "global"
      ? "https://" + "aiplatform.googleapis.com"
      : "https://" + LOCATION_VERTEX + "-aiplatform.googleapis.com";

    const currentContents = [
      ...historyContents,
      { role: "user", parts: userParts },
    ];

    // =========================================================================
    // INICIO DEL MOTOR DE STREAMING
    // =========================================================================
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let finalResponseText = "";
        let streamAborted = false;

        const sendToken = (text: string) => {
          if (streamAborted) {
            finalResponseText += text;
            return;
          }
          finalResponseText += text;
          try {
            controller.enqueue(encoder.encode(JSON.stringify({ type: "text", content: text }) + "\n"));
          } catch (e) {
            streamAborted = true;
            console.warn("[Background Sync] Cliente desconectado. Pasando ejecucion a segundo plano.");
          }
        };
        const sendProgress = (msg: string) => {
          if (streamAborted) return;
          try { controller.enqueue(encoder.encode(JSON.stringify({ type: "progress", content: msg }) + "\n")); } catch (e) { streamAborted = true; }
        };
        const sendError = (msg: string) => {
          if (streamAborted) return;
          try { controller.enqueue(encoder.encode(JSON.stringify({ type: "error", content: msg }) + "\n")); } catch (e) { streamAborted = true; }
        };
        const sendNotification = (panel: string) => {
          if (streamAborted) return;
          try { controller.enqueue(encoder.encode(JSON.stringify({ type: "notification", content: panel }) + "\n")); } catch (e) { streamAborted = true; }
        };

        const executeOfflineSync = async () => {
          try {
            const { getAdminDb } = require("@/lib/firebase-admin");
            const dbRef = getAdminDb();
            const userSnap = await dbRef.collection("users").doc(decodedToken.uid).get();
            const userData = userSnap.data();

            if (chatId && finalResponseText) {
              await dbRef.collection("users").doc(decodedToken.uid).collection("offline_messages").add({
                chatId,
                content: finalResponseText,
                timestamp: new Date().toISOString()
              });
            }

            if (userData?.pushToken && (streamAborted || chatId)) {
              await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: userData.pushToken,
                  title: "Rick AI 🛸",
                  body: streamAborted
                    ? "Se terminó de procesar tu solicitud en segundo plano. Abre la app para ver el resultado."
                    : "¡Listo! La respuesta ha sido generada.",
                  sound: "default"
                })
              });
            }
          } catch (err) {
            console.error("Fallo al ejecutar rutinas offline/push", err);
          }
        };

        try {
          let isDone = false;
          let loopCount = 0;
          const MAX_LOOPS = 15; // ¡Incrementado para evitar cierres prematuros durante el análisis de datos!

          while (!isDone && loopCount < MAX_LOOPS) {
            loopCount++;

            const geminiUrl = `${baseUrl}/v1/projects/${PROJECT_ID}/locations/${LOCATION_VERTEX}/publishers/google/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

            const geminiPayload = {
              contents: currentContents,
              systemInstruction: { parts: [{ text: systemPrompt }] },
              tools: driveTools,
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 65535,
                ...(GEMINI_MODEL === "gemini-3.1-pro-preview"
                  ? { thinkingConfig: { thinkingBudget: thinkingLevel === "high" ? 8192 : 1024 } }
                  : {}),
              },
              // 🛡️ BLINDAJE CORPORATIVO: Apaga los falsos positivos de la web
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
              ]
            };

            // --- SISTEMA DE REINTENTOS ANTI 429 ---
            let geminiRes;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount <= maxRetries) {
              sendProgress(retryCount === 0 ? "progress.analyzing" : "progress.retry");

              geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(geminiPayload),
              });

              if (geminiRes.status === 429 && retryCount < maxRetries) {
                retryCount++;
                const delay = retryCount * 5000;
                console.warn(`[Vertex AI] Error 429 detectado. Reintentando en ${delay / 1000}s (Intento ${retryCount}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                break;
              }
            }

            if (!geminiRes || !geminiRes.ok) {
              const errorBody = await geminiRes?.text() || "Sin respuesta";
              console.error("Gemini API error:", geminiRes?.status, errorBody);
              sendError(`Error en el motor de IA (${geminiRes?.status || 500}). Intenta de nuevo en un minuto.`);
              controller.close();
              return;
            }

            // Leemos el stream SSE
            const reader = geminiRes.body!.getReader();
            const decoder = new TextDecoder("utf-8");
            let doneReading = false;
            let bufferVertex = "";

            const functionCallParts: any[] = [];

            while (!doneReading) {
              const { value, done } = await reader.read();
              if (done) {
                doneReading = true;
                break;
              }

              bufferVertex += decoder.decode(value, { stream: true });
              const lines = bufferVertex.split('\n');
              bufferVertex = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.replace('data: ', '').trim();
                  if (dataStr === '[DONE]' || !dataStr) continue;

                  try {
                    const data = JSON.parse(dataStr);
                    const parts = data.candidates?.[0]?.content?.parts || [];

                    for (const part of parts) {
                      if (part.functionCall) {
                        functionCallParts.push(part);
                      } else if (part.text) {
                        sendToken(part.text);
                      }
                    }
                  } catch (e) {
                    console.error("Error parseando JSON de Vertex:", e);
                  }
                }
              }
            }

            if (bufferVertex.trim()) {
              try {
                const dataStr = bufferVertex.replace('data: ', '').trim();
                if (dataStr && dataStr !== '[DONE]') {
                  const data = JSON.parse(dataStr);
                  const parts = data.candidates?.[0]?.content?.parts || [];
                  for (const part of parts) {
                    if (part.functionCall) functionCallParts.push(part);
                    else if (part.text) sendToken(part.text);
                  }
                }
              } catch (e) { }
            }

            // Ejecución SECUENCIAL de herramientas
            if (functionCallParts.length > 0) {
              currentContents.push({ role: "model", parts: functionCallParts });


              const userResponseParts: any[] = [];

              for (const callPart of functionCallParts) {
                const callName = callPart.functionCall.name;
                const callArgs = callPart.functionCall.args;

                sendProgress(`progress.tool:${callName}`);
                console.log(`[Function Call Streaming Secuencial]: ${callName}`, callArgs);


                let functionResult: any = {};

                try {
                  // --- HERRAMIENTAS ADICIONALES ---
                  if (callName === "search_drive_files") {
                    functionResult = { files: await searchDriveFiles(callArgs.query, accessToken) };
                  } else if (callName === "get_drive_file") {
                    const fileData = await getDriveFileForAI(callArgs.fileId, callArgs.mimeType, accessToken);
                    if (fileData.type === 'media') {
                      if (isSupportedMimeType(fileData.mimeType)) {
                        functionResult = { status: "success", info: "Archivo inyectado visualmente." };
                      } else {
                        functionResult = { error: `No puedo visualizar el formato '${fileData.mimeType}'.` };
                      }
                    } else {
                      const contentStr = fileData.content || "";
                      functionResult = { content: contentStr.substring(0, 15000), nota: contentStr.length > 15000 ? "Truncado." : "" };
                    }
                  } else if (callName === "save_to_corporate_memory") {
                    functionResult = await saveToCorporateMemory(callArgs.title, callArgs.content);
                  } else if (callName === "read_recent_emails") {
                    functionResult = { correos_encontrados: await readRecentEmails(callArgs.targetEmail, callArgs.limit || 5) };
                  } else if (callName === "draft_email") {
                    functionResult = await draftEmail(callArgs.targetEmail, callArgs.to, callArgs.subject, callArgs.bodyText);
                  } else if (callName === "search_emails") {
                    functionResult = { resultados_busqueda: await searchEmails(callArgs.targetEmail, callArgs.query, 5) };
                  } else if (callName === "check_stock") {
                    functionResult = { inventario: await checkProductStock(callArgs.search) };
                  } else if (callName === "get_recent_orders") {
                    functionResult = { ultimos_pedidos: await getRecentOrders(callArgs.limit, callArgs.status) };
                  } else if (callName === "get_sales_report") {
                    functionResult = { reporte_mensual: await getSalesReport() };
                  } else if (callName === "get_traffic_summary") {
                    functionResult = { trafico_web: await getTrafficSummary(callArgs.date, callArgs.period) };
                  } else if (callName === "get_top_pages") {
                    functionResult = { paginas_mas_vistas: await getTopPages(callArgs.date, callArgs.period) };
                  } else if (callName === "get_domain_overview") {
                    functionResult = { seo_metrics: await getDomainOverview(callArgs.domain, callArgs.database) };
                  } else if (callName === "get_top_keywords") {
                    functionResult = { mejores_palabras: await getTopKeywords(callArgs.domain, callArgs.database) };
                  } else if (callName === "get_keyword_ideas") {
                    functionResult = { ideas_contenido: await getKeywordIdeas(callArgs.phrase, callArgs.database) };
                  } else if (callName === "get_site_audit_overview") {
                    functionResult = { auditoria_tecnica: await getSiteAuditOverview() };
                  } else if (callName === "search_web") {
                    functionResult = { internet_results: await searchWeb(callArgs.query) };
                  } else if (callName === "get_tiktok_marketing_stats") {
                    functionResult = { tiktok_stats: await getTikTokCampaignStats(callArgs.startDate, callArgs.endDate) };
                  } else if (callName === "generar_multimedia_marketing") {
                    try {
                      // Hacemos proxy local dinámico detectando la URL absoluta desde el contenedor de Cloud Run
                      const protocol = req.headers.get('x-forwarded-proto') || 'http';
                      const host = req.headers.get('host') || 'localhost:3000';
                      const proxyUrl = `${protocol}://${host}/api/tools/comfyui`;
                      const comfyRes = await fetch(proxyUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(callArgs),
                      });
                      if (comfyRes.ok) {
                        const jsonPayload = await comfyRes.json();
                        functionResult = { resultado_exitoso: jsonPayload };
                      } else {
                        const errorMsg = await comfyRes.text();
                        functionResult = { fallo_generacion: errorMsg };
                      }
                    } catch (rErr: any) {
                      functionResult = { error_interno_servidor: rErr.message };
                    }
                  } else if (callName === "generate_pdf_report") {
                    functionResult = { resultado: await generateAndUploadPDF(callArgs.title, callArgs.htmlContent) };
                    sendNotification("reports");
                  } else if (callName === "obtener_reporte_cajas") {
                    functionResult = { reporte_cajas: await getCashReportData(callArgs.date) };
                  } else if (callName === "ejecutar_analisis_estrategico") {
                    const analysisResult = await runFullStrategicAnalysis(decodedToken.uid);
                    functionResult = { resultado: "Análisis completado. Las nuevas estrategias ya están visibles en el panel 'Estrategias e IA'.", data: analysisResult };
                    sendNotification("recommendations");
                  } else if (callName === "mirar_sucursal") {
                    try {
                      // Hacemos proxy local dinámico
                      const protocol = req.headers.get('x-forwarded-proto') || 'http';
                      const host = req.headers.get('host') || 'localhost:3000';
                      const proxyUrl = `${protocol}://${host}/api/vision/analyze`;
                      const visionRes = await fetch(proxyUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ branchId: callArgs.branch_name.toLowerCase() }),
                      });
                      if (visionRes.ok) {
                        const data = await visionRes.json();
                        functionResult = {
                          status: "success",
                          reporte_visual: `En la sucursal de ${callArgs.branch_name} he detectado visualmente a ${data.summary.total_barbers} barberos y ${data.summary.total_clients} clientes. Hay ${data.summary.occupied_chairs} sillas ocupadas.`,
                          data_cruda: data
                        };
                      } else {
                        const errorMsg = await visionRes.text();
                        functionResult = { error: "No pude conectar con la cámara en este momento.", detalle: errorMsg };
                      }
                    } catch (err: any) {
                      functionResult = { error: "Fallo técnico al intentar mirar la sucursal.", detalle: err.message };
                    }
                  }
                  else if (callName === "analizar_diseno_figma") {
                    const base64Image = await getFigmaDesignAsImage(callArgs.figmaUrl);
                    userResponseParts.push({
                      inlineData: { mimeType: "image/png", data: base64Image }
                    });

                    functionResult = {
                      status: "success",
                      instruccion_interna: "La imagen del diseño de Figma se ha inyectado visualmente en tu contexto. Analízala ahora mismo como si el usuario te hubiera subido una foto y dale tu retroalimentación como vCOO."
                    };
                  }
                  else if (callName === "enviar_correo_mailgun") {
                    const mailResponse = await sendMailgunEmail(
                      callArgs.to,
                      callArgs.subject,
                      callArgs.text,
                      callArgs.html
                    );
                    functionResult = { status: "success", message: "Correo enviado exitosamente a través de Mailgun.", id: mailResponse.id };
                  }
                  else if (callName === "enviar_sms_twilio") {
                    try {
                      // Usamos proxy URL absoluta leyendo headers para evitar "fetch failed" interno
                      const protocol = req.headers.get('x-forwarded-proto') || 'http';
                      const host = req.headers.get('host') || 'localhost:3000';
                      const proxyUrl = `${protocol}://${host}/api/tools/sms`;
                      const smsRes = await fetch(proxyUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(callArgs),
                      });
                      if (smsRes.ok) {
                        const data = await smsRes.json();
                        functionResult = { resultado_sms: "Enviado con éxito", id: data.messageSid };
                      } else {
                        const errData = await smsRes.json();
                        functionResult = { error_envio: errData.error, codigo_twilio: errData.code };
                      }
                    } catch (e: any) {
                      functionResult = { fallo_servidor: e.message };
                    }
                  }
                  else if (callName === "actualizar_vista_looker") {
                    const tipoReporte = callArgs.tipo_reporte;
                    // Generamos el nombre de la vista, ej: looker_gastos_marketing
                    const nombreVista = `looker_${tipoReporte}`;

                    const createViewQuery = `CREATE OR REPLACE VIEW \`${PROJECT_ID}.mindbody_analytics.${nombreVista}\` AS ${callArgs.query}`;
                    await queryBigQuery(createViewQuery);

                    const lookerData = getLookerReportUrls();

                    functionResult = {
                      status: "success",
                      mensaje_interno: `La vista '${nombreVista}' ha sido actualizada en BigQuery. Muestra el iframe del dashboard y dile al usuario que navegue a la página de '${tipoReporte.replace('_', ' ')}' en su panel.`,
                      iframe_code: lookerData.iframeCode,
                      link_directo: lookerData.directUrl
                    };
                  }
                  // --- LA HERRAMIENTA MAESTRA (BIGQUERY) ---
                  else if (callName === "consultar_datos_bigquery") {
                    const resultados = await queryBigQuery(callArgs.query);
                    if (resultados.length > 100) {
                      functionResult = {
                        advertencia: `La consulta devolvió ${resultados.length} filas. Se han truncado a las primeras 100 para proteger la memoria operativa.`,
                        datos: resultados.slice(0, 100)
                      };
                    } else {
                      functionResult = { datos: resultados };
                    }
                  }
                  else if (callName === "create_scheduled_automation") {
                    await createScheduledTask(
                      callArgs.task_id,
                      callArgs.cron_expression,
                      callArgs.task_payload,
                      callArgs.user_description
                    );
                    functionResult = {
                      status: "success",
                      message: `La tarea '${callArgs.user_description}' con ID '${callArgs.task_id}' ha sido programada con éxito.`
                    };
                  }
                  else if (callName === "delete_scheduled_automation") {
                    const { deleteScheduledTask } = await import("@/lib/scheduler");
                    await deleteScheduledTask(callArgs.task_id);
                    functionResult = { status: "success", message: `Tarea '${callArgs.task_id}' eliminada.` };
                  }

                } catch (e: any) {
                  console.error(`Error ejecutando ${callName}:`, e);
                  functionResult = { error: e.message || "Error al ejecutar la herramienta." };
                }

                userResponseParts.push({
                  functionResponse: { name: callName, response: functionResult }
                });
              }

              // ELIMINADO: FRENO ANTI-RATE LIMITS (El bloque try/catch de 429 superior ya maneja esto sin retrasar la respuesta)
              // console.log("[Rate Limit Protection] Pausando 4s antes de volver a llamar a Vertex...");
              // await new Promise(resolve => setTimeout(resolve, 4000));

              currentContents.push({ role: "user", parts: userResponseParts });

            } else {
              isDone = true;
            }
          }

          if (!streamAborted) controller.close();
          await executeOfflineSync();

        } catch (error: any) {
          sendError(error.message);
          if (!streamAborted) controller.close();
          await executeOfflineSync();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error interno del servidor", details: errorMessage },
      { status: 500 }
    );
  }
}
