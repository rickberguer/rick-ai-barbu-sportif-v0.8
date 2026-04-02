// lib/bigquery.ts
import { BigQuery } from '@google-cloud/bigquery';

// Al estar en Cloud Run con la cuenta barbu-drive-reader, la autenticación es automática.
const bigquery = new BigQuery({
  projectId: 'barbu-sportif-ai-center'
});

export async function queryBigQuery(sqlQuery: string) {
  try {
    // Medida de seguridad: Asegurarnos de que Rick solo haga consultas de lectura o creación de vistas
    const cleanQuery = sqlQuery.trim().toUpperCase();

    // Evaluamos las 3 operaciones permitidas en el ecosistema de Barbu Sportif
    const isSelect = cleanQuery.startsWith('SELECT');
    const isWith = cleanQuery.startsWith('WITH');
    const isCreateView = cleanQuery.startsWith('CREATE OR REPLACE VIEW') || cleanQuery.startsWith('CREATE VIEW');

    if (!isSelect && !isWith && !isCreateView) {
      throw new Error("Bloqueo de seguridad: Rick solo tiene permitido ejecutar consultas SELECT, WITH o CREATE VIEW.");
    }

    console.log("[Rick AI] Ejecutando consulta en BigQuery:", sqlQuery);

    const options = {
      query: sqlQuery,
      // Se fuerza la ubicación a northamerica-northeast1 ya que el dataset de Mindbody está allí
      location: 'northamerica-northeast1', 
    };

    const [job] = await bigquery.createQueryJob(options);
    const [rows] = await job.getQueryResults();

    return rows;
  } catch (error: any) {
    console.error("[Rick AI] Error en BigQuery:", error.message);
    throw new Error(`Error al consultar la base de datos: ${error.message}`);
  }
}

export async function insertVisionLog(rows: any[]) {
  const datasetId = 'mindbody_analytics';
  const tableId = 'vision_analytics';
  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    await table.insert(rows);
    console.log(`[Vision Log] Inserted ${rows.length} rows into ${datasetId}.${tableId}`);
  } catch (error: any) {
    console.error("[Vision Log] Error in insertVisionLog:", error.message);
    throw error;
  }
}