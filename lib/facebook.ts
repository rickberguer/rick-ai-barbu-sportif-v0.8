// lib/facebook.ts

const FB_API_VERSION = "v25.0";

export interface FacebookAdStat {
  date: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number; // Conversiones (Leads, Compras, etc.)
}

/**
 * Se conecta a la Graph API de Meta y extrae el rendimiento diario de las campañas.
 * Maneja automáticamente la paginación para no perder ni un solo dato.
 */
export async function getFacebookCampaignInsights(startDate: string, endDate: string): Promise<FacebookAdStat[]> {
  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaAccountIdRaw = process.env.META_AD_ACCOUNT_ID; 

  if (!metaToken || !metaAccountIdRaw) {
    throw new Error("Faltan credenciales META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en el archivo .env");
  }

  // Aseguramos el prefijo 'act_' que exige Meta
  const metaAccountId = metaAccountIdRaw.startsWith('act_') 
    ? metaAccountIdRaw 
    : `act_${metaAccountIdRaw}`;

  const timeRangeJson = JSON.stringify({ since: startDate, until: endDate });
  const queryParams = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_range: timeRangeJson,
    time_increment: '1', // Obliga a desglosar día por día
    limit: '500', 
    access_token: metaToken
  });

  let url = `https://graph.facebook.com/${FB_API_VERSION}/${metaAccountId}/insights?${queryParams.toString()}`;
  let allAdsData: any[] = []; 

  // Motor de extracción con Paginación
  while (url) {
    const fbRes = await fetch(url);
    const fbData = await fbRes.json();

    if (fbData.error) {
      throw new Error(`Error en API Meta: ${fbData.error.message}`);
    }

    if (fbData.data && fbData.data.length > 0) {
      allAdsData = allAdsData.concat(fbData.data);
    }

    if (fbData.paging && fbData.paging.next) {
      url = fbData.paging.next;
    } else {
      url = ""; 
    }
  }

  // Mapeo y limpieza de datos
  const cleanData: FacebookAdStat[] = allAdsData.map((ad: any) => {
    let resultsCount = 0;
    
    // Extracción de conversiones de Meta (Actions Array)
    if (ad.actions) {
      const resultAction = ad.actions.find((a: any) => 
        a.action_type === 'lead' || 
        a.action_type === 'purchase' || 
        a.action_type === 'onsite_conversion.lead_grouped'
      );
      if (resultAction) {
        resultsCount = parseInt(resultAction.value, 10);
      }
    }

    return {
      date: ad.date_start,
      campaign_id: ad.campaign_id || 'N/A',
      campaign_name: (ad.campaign_name || 'Sin Nombre').replace(/'/g, "\\'"), // Previene inyección SQL
      spend: parseFloat(ad.spend || 0),
      impressions: parseInt(ad.impressions || 0, 10),
      clicks: parseInt(ad.clicks || 0, 10),
      results: resultsCount
    };
  });

  return cleanData;
}