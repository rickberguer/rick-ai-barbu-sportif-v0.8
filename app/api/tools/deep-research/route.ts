export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "barbu-sportif-ai-center";

// 1. Región para Vertex AI (Global para v3)
const LOCATION_VERTEX = "global";
const LOCATION_DATA = "global";

// 2. Matriz de Data Stores para investigación profunda
const DATA_STORE_IDS = [
  "data-barbu-ric-bs_1771662530096",
  "barbu-ric-documentos-trabajo_1771662424554",
  "barbudrive_1771656456305"
];

// Actualizado a la versión estable
const GEMINI_MODEL = "gemini-3.1-pro-preview";

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
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch {
      return NextResponse.json({
        response:
          `**Modo vista previa** - Deep Research requiere Cloud Run con Vertex AI.\n\nConsulta recibida: "${query}"`,
      });
    }

    // --- CORRECCIÓN DEL ENDPOINT GLOBAL A V1 ---
    const baseUrl = LOCATION_VERTEX === "global"
      ? "https://aiplatform.googleapis.com"
      : `https://${LOCATION_VERTEX}-aiplatform.googleapis.com`;

    const geminiUrl = `${baseUrl}/v1/projects/${PROJECT_ID}/locations/${LOCATION_VERTEX}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

    // Step 1: Generar sub-consultas (Mantenemos esto para guiar a la IA)
    const searchQueries = [query];
    const subQueryRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Dada esta pregunta de investigación corporativa: "${query}"\n\nGenera 3 sub-consultas de búsqueda diferentes que ayudarían a investigar a fondo este tema en nuestros documentos internos. Devuelve SOLO las consultas, una por línea, sin numeración.` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
      }),
    });

    if (subQueryRes.ok) {
      const subData = await subQueryRes.json();
      const subText = subData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const subs = subText.split("\n").map((l: string) => l.trim()).filter(Boolean).slice(0, 3);
      searchQueries.push(...subs);
    }

    // ELIMINADO: Step 2 original (Búsqueda manual en paralelo).
    // Ahora configuramos las herramientas nativas de retrieval.

    // Step 2 (NUEVO): Construir Herramientas de Data Store
    const dataStoreTools = DATA_STORE_IDS.map(dsId => ({
      retrieval: {
        vertexAiSearch: {
          datastore: `projects/${PROJECT_ID}/locations/${LOCATION_DATA}/collections/default_collection/dataStores/${dsId}`
        }
      }
    }));

    // Step 3: Deep analysis with Gemini 3 Pro (Agentic RAG)
    const deepPrompt = `
Eres un investigador experto y Director Operativo Virtual (vCOO) de la cadena Barbu Sportif. 
Realiza un analisis PROFUNDO y EXHAUSTIVO sobre el siguiente tema central: "${query}"

Para asegurar una cobertura total, DEBES utilizar tus herramientas de búsqueda (Data Stores) para investigar la información corporativa considerando estos ángulos o sub-temas:
${searchQueries.map(sq => `- ${sq}`).join('\n')}

INSTRUCCIONES:
1. Busca PROACTIVAMENTE en los índices vinculados toda la información relacionada antes de responder.
2. Estructura tu respuesta con títulos claros usando ## para secciones principales.
3. Incluye un **Resumen Ejecutivo** al inicio.
4. Desarrolla cada punto con profundidad, citando las fuentes corporativas exactas que encuentres en los documentos.
5. Incluye una sección de **Datos Clave** con bullets.
6. Termina con **Conclusiones y Recomendaciones** aplicables a la operativa de las barberías.
7. Usa formato Markdown profesional.
8. Responde en el idioma de la consulta del usuario.
9. Sé exhaustivo: mínimo 500 palabras de análisis.
`;

    const researchRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: deepPrompt }] }],
        tools: [{ retrieval: dataStoreTools[0].retrieval }, { retrieval: dataStoreTools[1].retrieval }, { retrieval: dataStoreTools[2].retrieval }], // Pasamos los 3 data stores como herramientas
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 65535
        },
      }),
    });

    if (!researchRes.ok) {
      const errText = await researchRes.text();
      throw new Error(`Gemini returned ${researchRes.status}: ${errText}`);
    }

    const researchData = await researchRes.json();
    const response = researchData.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo completar la investigacion.";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Deep research error:", error);
    return NextResponse.json(
      { error: "Error in deep research", details: (error as Error).message },
      { status: 500 }
    );
  }
}