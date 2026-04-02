// lib/matomo.ts

const MATOMO_URL = "https://matomo.barbusportif.ca/index.php";

/**
 * Función base para hacer consultas seguras a la API de Matomo
 */
async function fetchMatomoAPI(method: string, extraParams: Record<string, string> = {}) {
  // LAZY INITIALIZATION: Leemos las variables justo en el momento de la ejecución
  const SITE_ID = process.env.MATOMO_SITE_ID || "1";
  const TOKEN = process.env.MATOMO_TOKEN;

  if (!TOKEN) throw new Error("Falta el MATOMO_TOKEN en las variables de entorno.");

  const params = new URLSearchParams({
    module: "API",
    method: method,
    idSite: SITE_ID,
    format: "json",
    token_auth: TOKEN.trim(), // .trim() elimina espacios vacíos copiados por error
    ...extraParams
  });

  // Usamos POST en lugar de GET para evitar que el Firewall de IONOS bloquee el token en la URL
  const response = await fetch(MATOMO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString()
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("401 No Autorizado. Verifica que el token tenga permisos de lectura en Matomo.");
    if (response.status === 403) throw new Error("403 Prohibido. El ID del sitio puede ser incorrecto.");
    throw new Error(`Error de red con Matomo: ${response.status}`);
  }

  const data = await response.json();
  if (data.result === "error") throw new Error(data.message);

  return data;
}

/**
 * Obtiene un resumen del tráfico web (visitas, acciones, tiempo en sitio)
 */
export async function getTrafficSummary(date: string = "today", period: string = "day") {
  try {
    const data = await fetchMatomoAPI("VisitsSummary.get", { date, period });
    return {
      visitas: data.nb_visits || 0,
      acciones_pageviews: data.nb_actions || 0,
      usuarios_unicos: data.nb_uniq_visitors || data.nb_users || data.nb_visits || 0,
      duracion_promedio_segundos: data.avg_time_on_site || 0,
      tasa_rebote: data.bounce_rate || "0%",
      periodo: `${period} - ${date}`
    };
  } catch (error: any) {
    console.error("Error Matomo Traffic:", error.message);
    throw new Error("No pude obtener el resumen de tráfico de Matomo.");
  }
}

/**
 * Obtiene las páginas más visitadas del sitio web
 */
export async function getTopPages(date: string = "today", period: string = "day") {
  try {
    const data = await fetchMatomoAPI("Actions.getPageUrls", {
      date,
      period,
      filter_limit: "5"
    });

    if (!Array.isArray(data)) return [];

    return data.map((page: any) => ({
      url: page.label,
      visitas: page.nb_visits,
      tiempo_promedio: page.avg_time_generation || 0
    }));
  } catch (error: any) {
    console.error("Error Matomo Pages:", error.message);
    throw new Error("No pude obtener las páginas más visitadas.");
  }
}

/**
 * Obtiene los países con más visitas
 */
export async function getTopCountries(date: string = "today", period: string = "day") {
  try {
    const data = await fetchMatomoAPI("UserCountry.getCountry", {
      date,
      period,
      filter_limit: "5"
    });

    if (!Array.isArray(data)) return [];

    return data.map((country: any) => ({
      pais: country.label,
      codigo: country.code,
      visitas: country.nb_visits
    }));
  } catch (error: any) {
    console.error("Error Matomo Countries:", error.message);
    throw new Error("No pude obtener los países.");
  }
}

/**
 * Obtiene la evolución de visitas en un periodo
 */
export async function getVisitsEvolution(date: string = "last30", period: string = "day") {
  try {
    // Para evolution usamos range o arrays de date
    const data = await fetchMatomoAPI("VisitsSummary.get", {
      date,
      period
    });

    // data suele ser un objeto con fechas como keys
    if (typeof data !== 'object') return [];

    return Object.keys(data).map(dateKey => ({
      date: dateKey,
      visitas: data[dateKey]?.nb_visits || 0
    }));
  } catch (error: any) {
    console.error("Error Matomo Evolution:", error.message);
    throw new Error("No pude obtener la evolución de visitas.");
  }
}

/**
 * Obtiene el origen de las visitas (orgánico, directo, redes sociales, etc.)
 */
export async function getReferrerTypes(date: string = "today", period: string = "day") {
  try {
    const data = await fetchMatomoAPI("Referrers.getReferrerType", { date, period });
    if (!Array.isArray(data)) return [];
    
    return data.map((ref: any) => ({
      name: ref.label,
      value: ref.nb_visits || 0
    }));
  } catch (error: any) {
    console.error("Error Matomo Referrers:", error.message);
    return [];
  }
}

/**
 * Obtiene el detalle de las redes sociales
 */
export async function getSocialReferrers(date: string = "today", period: string = "day") {
  try {
    const data = await fetchMatomoAPI("Referrers.getSocials", { date, period, filter_limit: "5" });
    if (!Array.isArray(data)) return [];
    
    return data.map((ref: any) => ({
      name: ref.label,
      value: ref.nb_visits || 0
    }));
  } catch (error: any) {
    console.error("Error Matomo Socials:", error.message);
    return [];
  }
}

/**
 * Obtiene el detalle de campañas de marketing (UTMs)
 */
export async function getCampaigns(date: string = "today", period: string = "day") {
  try {
    const data = await fetchMatomoAPI("Referrers.getCampaigns", { date, period, filter_limit: "30" });
    if (!Array.isArray(data)) return [];
    
    return data.map((c: any) => ({
      name: c.label,
      value: c.nb_visits || 0
    }));
  } catch (error: any) {
    console.error("Error Matomo Campaigns:", error.message);
    return [];
  }
}

/**
 * Obtiene contadores en tiempo real (visitas en los últimos X minutos)
 */
export async function getLiveCounters(lastMinutes: number = 30) {
  try {
    const data = await fetchMatomoAPI("Live.getCounters", {
      lastMinutes: lastMinutes.toString()
    });
    // Retorna algo como [{ "visitors": 5, "actions": 12, ... }]
    return data[0] || { visitors: 0, actions: 0 };
  } catch (error: any) {
    console.error("Error Matomo Live:", error.message);
    return { visitors: 0, actions: 0 };
  }
}