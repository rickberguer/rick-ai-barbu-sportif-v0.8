const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { BigQuery } = require('@google-cloud/bigquery');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.local') });

// 1. Inicializar Firebase
function getFirebaseAdminApp() {
  if (!getApps().length) {
    return initializeApp({ projectId: 'barbu-sportif-ai-center' });
  }
  return getApps()[0];
}
const db = getFirestore(getFirebaseAdminApp(), 'barbuaidb');

// 2. Inicializar BigQuery
const bigquery = new BigQuery({ projectId: 'barbu-sportif-ai-center' });

const TIKTOK_BASE_URL = "https://business-api.tiktok.com/open_api/v1.3";

async function runBackfill() {
  console.log("=== INICIANDO BACKFILL DE TIKTOK ADS (DESDE 2024) ===");

  try {
    // 3. Obtener token de Firestore
    console.log("Obteniendo credenciales de Firestore...");
    const configDoc = await db.collection('integrations').doc('tiktok').get();
    if (!configDoc.exists) {
      throw new Error("No hay token de TikTok configurado. Primero haz login en la ruta /api/auth/tiktok/callback");
    }
    const config = configDoc.data();
    const accessToken = config.access_token;
    const advertiserId = config.advertiser_ids[0];

    // 4. Calcular el rango de fechas (Desde 2024 hasta hoy)
    let currentStart = new Date("2024-01-01");
    const finalEnd = new Date();

    // 5. Crear esquemas si no existen
    console.log("Creando tablas en BigQuery si no existen...");
    const setupQuery = `
      CREATE SCHEMA IF NOT EXISTS \`tiktok_ads_analytics\` OPTIONS(location="northamerica-northeast1");
      
      CREATE TABLE IF NOT EXISTS \`tiktok_ads_analytics.campaign_daily_stats\` (
        date DATE,
        campaign_id STRING,
        campaign_name STRING,
        spend FLOAT64,
        clicks INT64,
        impressions INT64,
        conversions INT64
      );

      CREATE TABLE IF NOT EXISTS \`tiktok_ads_analytics.campaign_audience_stats\` (
        date DATE,
        campaign_id STRING,
        campaign_name STRING,
        gender STRING,
        age STRING,
        spend FLOAT64,
        clicks INT64,
        impressions INT64,
        conversions INT64
      );
    `;
    await bigquery.query({ query: setupQuery, location: 'northamerica-northeast1' });

    // 6. Bucle de extracción en bloques de 30 días
    while (currentStart < finalEnd) {
      let nextEnd = new Date(currentStart);
      nextEnd.setDate(nextEnd.getDate() + 28);
      if (nextEnd > finalEnd) nextEnd = finalEnd;

      const formatTiktokDate = (d) => d.toISOString().split('T')[0];
      const formatBqDate = (d) => d.toISOString().split('T')[0];

      const sDateStr = formatTiktokDate(currentStart);
      const eDateStr = formatTiktokDate(nextEnd);

      console.log(`\n📦 Procesando bloque: ${formatBqDate(currentStart)} al ${formatBqDate(nextEnd)}`);

      // 🛑 BLOQUE 1: REPORTE GENERAL DE CAMPAÑAS
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
        metrics: JSON.stringify(["spend", "clicks", "impressions", "conversion"]),
        start_date: sDateStr,
        end_date: eDateStr,
        page_size: '1000'
      });

      const response = await fetch(`${TIKTOK_BASE_URL}/report/integrated/get/?${params.toString()}`, {
        method: 'GET',
        headers: { 'Access-Token': accessToken }
      });

      const data = await response.json();

      if (data.code === 0 && data.data && data.data.list && data.data.list.length > 0) {
        console.log(`- Insertando/Actualizando ${data.data.list.length} filas en campaign_daily_stats...`);
        const sData = data.data.list.map((r) => {
          const date = (r.dimensions.stat_time_day || '1970-01-01').split(' ')[0];
          const campName = 'TikTok Campaign'; // no permitido con stat_time_day
          return `SELECT DATE('${date}') as date, '${r.dimensions.campaign_id}' as campaign_id, '${campName}' as campaign_name, ${parseFloat(r.metrics.spend) || 0} as spend, ${parseInt(r.metrics.clicks) || 0} as clicks, ${parseInt(r.metrics.impressions) || 0} as impressions, ${parseInt(r.metrics.conversion) || 0} as conversions`;
        }).join("\nUNION ALL\n");

        const mergeQuery = `
          MERGE \`tiktok_ads_analytics.campaign_daily_stats\` T
          USING (${sData}) S
          ON T.date = S.date AND T.campaign_id = S.campaign_id
          WHEN MATCHED THEN UPDATE SET T.spend = S.spend, T.clicks = S.clicks, T.impressions = S.impressions, T.conversions = S.conversions, T.campaign_name = S.campaign_name
          WHEN NOT MATCHED THEN INSERT (date, campaign_id, campaign_name, spend, clicks, impressions, conversions) VALUES (S.date, S.campaign_id, S.campaign_name, S.spend, S.clicks, S.impressions, S.conversions)
        `;
        await bigquery.query({ query: mergeQuery, location: 'northamerica-northeast1' });
      } else if (data.code !== 0) {
        console.error(`  ❌ Error API Campañas [${data.code}]: ${data.message || 'Desconocido'}`);
      } else {
        console.log(`  - 0 filas encontradas.`);
      }

      /*
      // 🛑 BLOQUE 2: REPORTE AUDIENCIA (GENTE)
      const paramsAudience = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(["campaign_id", "campaign_name", "gender", "age"]),
        metrics: JSON.stringify(["spend", "clicks", "impressions", "conversion"]),
        start_date: sDateStr,
        end_date: eDateStr,
        page_size: '1000'
      });

      const responseAudience = await fetch(`${TIKTOK_BASE_URL}/report/integrated/get/?${paramsAudience.toString()}`, {
        method: 'GET',
        headers: { 'Access-Token': accessToken }
      });

      const dataAudience = await responseAudience.json();

      if (dataAudience.code === 0 && dataAudience.data && dataAudience.data.list && dataAudience.data.list.length > 0) {
        console.log(`- Insertando/Actualizando ${dataAudience.data.list.length} filas en campaign_audience_stats...`);
        const sDataAudience = dataAudience.data.list.map((r) => {
          const campName = r.dimensions.campaign_name ? r.dimensions.campaign_name.replace(/'/g, "\\'") : 'Sin nombre';
          return `SELECT '${r.dimensions.campaign_id}' as campaign_id, '${campName}' as campaign_name, '${r.dimensions.gender || 'Unknown'}' as gender, '${r.dimensions.age || 'Unknown'}' as age, ${parseFloat(r.metrics.spend) || 0} as spend, ${parseInt(r.metrics.clicks) || 0} as clicks, ${parseInt(r.metrics.impressions) || 0} as impressions, ${parseInt(r.metrics.conversion) || 0} as conversions`;
        }).join("\nUNION ALL\n");

        const mergeQueryAudience = `
          MERGE \`tiktok_ads_analytics.campaign_audience_stats\` T
          USING (${sDataAudience}) S
          ON T.campaign_id = S.campaign_id AND T.gender = S.gender AND T.age = S.age
          WHEN MATCHED THEN UPDATE SET T.spend = T.spend + S.spend, T.clicks = T.clicks + S.clicks, T.impressions = T.impressions + S.impressions, T.conversions = T.conversions + S.conversions
          WHEN NOT MATCHED THEN INSERT (campaign_id, campaign_name, gender, age, spend, clicks, impressions, conversions) VALUES (S.campaign_id, S.campaign_name, S.gender, S.age, S.spend, S.clicks, S.impressions, S.conversions)
        `;
        await bigquery.query({ query: mergeQueryAudience, location: 'northamerica-northeast1' });
      } else if (dataAudience.code !== 0) {
        console.error(`  ❌ Error API Audiencia [${dataAudience.code}]: ${dataAudience.message || 'Desconocido'}`);
      } else {
        console.log(`  - 0 filas audiencia.`);
      }
      */

      // Incrementar 30 días
      currentStart = new Date(nextEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }

    console.log("\n✅ BACKFILL COMPLETADO CON ÉXITO.");

  } catch (error) {
    console.error("\n❌ Error en el proceso de backfill:", error.message);
  }
}

runBackfill();
