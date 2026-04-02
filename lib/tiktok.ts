import { getAdminDb } from './firebase-admin';

// TikTok API Base URL
const TIKTOK_BASE_URL = "https://business-api.tiktok.com/open_api/v1.3";

interface TikTokAuthConfig {
  access_token: string;
  advertiser_ids: string[];
  updated_at: string;
}

/**
 * Guarda los tokens y configuración de TikTok en Firestore para Rick
 */
export async function saveTikTokConfig(config: TikTokAuthConfig) {
  const db = getAdminDb();
  await db.collection('integrations').doc('tiktok').set(config, { merge: true });
}

/**
 * Obtiene la configuración de TikTok de Firestore
 */
export async function getTikTokConfig(): Promise<TikTokAuthConfig | null> {
  const db = getAdminDb();
  const doc = await db.collection('integrations').doc('tiktok').get();
  return doc.exists ? doc.data() as TikTokAuthConfig : null;
}

/**
 * Intercambia el código de autorización por un access_token de TikTok
 */
export async function exchangeTikTokCode(code: string) {
  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_SECRET;

  if (!appId || !secret) {
    throw new Error("Faltan TIKTOK_APP_ID o TIKTOK_SECRET en el servidor.");
  }

  const response = await fetch(`${TIKTOK_BASE_URL}/oauth2/access_token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      secret: secret,
      auth_code: code,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error en TikTok Ads Token: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Error API TikTok [${data.code}]: ${data.message || 'Desconocido'}`);
  }

  // Guardar en Firestore
  const accessToken = data.data.access_token;
  const advertiserIds = data.data.advertiser_ids || [];

  await saveTikTokConfig({
    access_token: accessToken,
    advertiser_ids: advertiserIds,
    updated_at: new Date().toISOString()
  });

  return { access_token: accessToken, advertiser_ids: advertiserIds };
}

/**
 * Consulta estadísticas de TikTok Ads
 * Dimensiones: campaign_id, campaign_name
 * Médicas: spend, clicks, impressions, conversions
 */
export async function getTikTokCampaignStats(startDate: string, endDate: string) {
  const config = await getTikTokConfig();
  if (!config || !config.access_token || config.advertiser_ids.length === 0) {
    throw new Error("No hay token de TikTok configurado. Primero haz login en la ruta /api/auth/tiktok/callback");
  }

  const accessToken = config.access_token;
  const advertiserId = config.advertiser_ids[0]; // Usamos el primer advertiser ID por defecto

  // Endpoint de reportes
  const url = `${TIKTOK_BASE_URL}/report/integrated/get/`;

  // TikTok API espera parámetros como query params o JSON POST
  // Para report/integrated/get/, suele ser GET o POST. Usaremos query params
  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_CAMPAIGN', // 'AUCTION_CAMPAIGN_DAILY' si quieres segmento por día
    dimensions: JSON.stringify(["campaign_id", "campaign_name"]),
    metrics: JSON.stringify(["spend", "clicks", "impressions", "conversion"]),
    start_date: startDate,
    end_date: endDate,
    page_size: '100'
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Access-Token': accessToken, // El header oficial suele ser 'Access-Token' en lugar de Authorization
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error TikTok Reporting: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Error API TikTok Report [${data.code}]: ${data.message || 'Desconocido'}`);
  }

  return data.data.list || [];
}

/**
 * Consulta estadísticas Diarias de TikTok Ads (Para Sync a BigQuery)
 */
export async function getTikTokDailyStatsSync(startDate: string, endDate: string) {
  const config = await getTikTokConfig();
  if (!config || !config.access_token || config.advertiser_ids.length === 0) {
    throw new Error("No hay token de TikTok configurado.");
  }

  const accessToken = config.access_token;
  const advertiserId = config.advertiser_ids[0];

  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_CAMPAIGN', // Segmento DIARIO mediante dimension stat_time_day
    dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
    metrics: JSON.stringify(["spend", "clicks", "impressions", "conversion"]),
    start_date: startDate,
    end_date: endDate,
    page_size: '1000'
  });

  const url = `${TIKTOK_BASE_URL}/report/integrated/get/`;

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: { 'Access-Token': accessToken }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error TikTok Sync: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Error API TikTok Sync [${data.code}]: ${data.message || 'Desconocido'}`);
  }

  return data.data.list || [];
}
