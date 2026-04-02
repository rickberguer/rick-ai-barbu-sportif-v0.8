// lib/semrush.ts

const SEMRUSH_API_URL = "https://api.semrush.com/";

function getApiKey() {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) throw new Error("Falta la variable de entorno SEMRUSH_API_KEY en el servidor.");
  return key;
}

// 1. Resumen General del Dominio (Ya lo teníamos)
export async function getDomainOverview(domain: string = "barbusportif.ca", database: string = "ca") {
  try {
    const apiKey = getApiKey();
    const params = new URLSearchParams({
      type: 'domain_ranks',
      key: apiKey,
      domain: domain,
      database: database,
      export_columns: 'Or,Ot,Oc,Ad,At'
    });

    const response = await fetch(`${SEMRUSH_API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const textData = await response.text();
    if (textData.includes('ERROR')) throw new Error(`SEMrush Error: ${textData.trim()}`);

    const lines = textData.trim().split('\n');
    if (lines.length < 2) return { status: "Sin datos", info: "El dominio no tiene métricas." };

    const headers = lines[0].split(';');
    const values = lines[1].split(';');
    const result: Record<string, string> = {};
    headers.forEach((h, i) => result[h.trim()] = values[i]?.trim() || "0");

    return { dominio: domain, mercado: database, metricas_seo: result };
  } catch (error: any) {
    console.error(`Error SEMrush Domain Overview:`, error.message);
    throw new Error("No se pudo obtener la info general de SEMrush.");
  }
}

// 2. NUEVO: Extraer las mejores Palabras Clave de un Dominio (Espionaje/Auditoría)
export async function getTopKeywords(domain: string = "barbusportif.ca", database: string = "ca", limit: number = 15) {
  try {
    const apiKey = getApiKey();
    // Ph: Phrase, Po: Position, Nq: Search Volume, Cp: CPC, Ur: URL
    const params = new URLSearchParams({
      type: 'domain_organic',
      key: apiKey,
      domain: domain,
      database: database,
      display_limit: limit.toString(),
      export_columns: 'Ph,Po,Nq,Cp,Ur',
      sort: 'nq_desc' // Ordenamos por mayor volumen de búsqueda
    });

    const response = await fetch(`${SEMRUSH_API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const textData = await response.text();
    if (textData.includes('ERROR')) throw new Error(`SEMrush Error: ${textData.trim()}`);

    const lines = textData.trim().split('\n');
    if (lines.length < 2) return { status: "Sin datos", info: "No se encontraron palabras clave." };

    const headers = lines[0].split(';');
    const keywords = lines.slice(1).map(line => {
      const values = line.split(';');
      return {
        palabra_clave: values[0],
        posicion_google: values[1],
        volumen_mensual: values[2],
        costo_por_clic_usd: values[3],
        url_posicionada: values[4]
      };
    });

    return { dominio: domain, mercado: database, top_palabras_clave: keywords };
  } catch (error: any) {
    console.error(`Error SEMrush Top Keywords:`, error.message);
    throw new Error("No se pudo obtener la lista de palabras clave.");
  }
}

// 3. NUEVO: Generador de Ideas de Contenido y Búsquedas Relacionadas
export async function getKeywordIdeas(phrase: string, database: string = "ca", limit: number = 15) {
  try {
    const apiKey = getApiKey();
    // Ph: Phrase, Nq: Search Volume, Cp: CPC, Co: Competition (0 a 1)
    const params = new URLSearchParams({
      type: 'phrase_related',
      key: apiKey,
      phrase: phrase,
      database: database,
      display_limit: limit.toString(),
      export_columns: 'Ph,Nq,Cp,Co',
      sort: 'nq_desc'
    });

    const response = await fetch(`${SEMRUSH_API_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const textData = await response.text();
    if (textData.includes('ERROR')) throw new Error(`SEMrush Error: ${textData.trim()}`);

    const lines = textData.trim().split('\n');
    if (lines.length < 2) return { status: "Sin datos", info: "No hay ideas relacionadas para esta frase." };

    const keywords = lines.slice(1).map(line => {
      const values = line.split(';');
      return {
        frase_relacionada: values[0],
        volumen_busqueda: values[1],
        costo_por_clic_usd: values[2],
        dificultad_competencia: values[3]
      };
    });

    return { frase_semilla: phrase, mercado: database, ideas_recomendadas: keywords };
  } catch (error: any) {
    console.error(`Error SEMrush Keyword Ideas:`, error.message);
    throw new Error("No se pudieron obtener ideas de palabras clave.");
  }
}

// 4. NUEVO: Auditoría Técnica del Sitio (Requiere Project ID)
export async function getSiteAuditOverview() {
  try {
    const apiKey = getApiKey();
    const projectId = process.env.SEMRUSH_PROJECT_ID;
    if (!projectId) throw new Error("Falta SEMRUSH_PROJECT_ID para la auditoría.");

    // Primero listamos snapshots para tener el último
    const snapshotRes = await fetch(`https://api.semrush.com/reports/v1/projects/${projectId}/siteaudit/snapshots?key=${apiKey}`);
    if (!snapshotRes.ok) throw new Error("Fallo al listar snapshots de auditoría.");
    const snapshots = await snapshotRes.json();

    if (!snapshots || snapshots.length === 0) return { status: "Sin auditoría", info: "No se encontró ningún reporte de auditoría activo." };

    const latestId = snapshots[0].snapshotId;
    const overviewRes = await fetch(`https://api.semrush.com/reports/v1/projects/${projectId}/siteaudit/snapshots/${latestId}/overview?key=${apiKey}`);
    if (!overviewRes.ok) throw new Error("Fallo al obtener el resumen de la auditoría.");
    
    const data = await overviewRes.json();
    return {
      salud_sitio: `${data.siteHealth}%`,
      errores_totales: data.totalErrors,
      advertencias_totales: data.totalWarnings,
      paginas_rastreadas: data.totalCrawledPages,
      ultima_actualizacion: data.snapshotDate ? new Date(data.snapshotDate).toLocaleDateString() : "Desconocida",
      mejoras_vs_anterior: data.siteHealthCompare || 0
    };
  } catch (error: any) {
    console.error(`Error SEMrush Site Audit:`, error.message);
    throw new Error("No se pudo obtener la auditoría técnica.");
  }
}