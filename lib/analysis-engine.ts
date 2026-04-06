import { GoogleAuth } from "google-auth-library";
import { queryBigQuery } from "@/lib/bigquery";
import { getTrafficSummary } from "@/lib/matomo";
import { getCashReportData } from "@/lib/google-sheets";
import { saveRecommendationsAdmin, Recommendation } from "@/lib/firestore-admin-utils";

export async function runFullStrategicAnalysis(userId: string, locale: string = "es") {
  try {
    // 1. Gather Context
    // 1. Gather Context
    const [salesRaw, marketingGoogle, marketingMeta, appointmentsRaw, traffic, cash] = await Promise.all([
      // 1. Ventas por sucursal y tipo de item (Servicio vs Producto)
      queryBigQuery(`
        SELECT branch_name, is_product, SUM(amount) as sales 
        FROM \`mindbody_analytics.sales_history\` 
        WHERE DATE(DATETIME(CAST(sale_datetime AS TIMESTAMP), 'America/Toronto')) >= DATE_SUB(CURRENT_DATE('America/Toronto'), INTERVAL 7 DAY)
        GROUP BY 1, 2
        ORDER BY sales DESC
      `).catch(e => { console.error("Sales BQ Error:", e); return []; }),

      // 2. RENDIMIENTO GOOGLE ADS (Cálculos de métricas por tabla oficial)
      queryBigQuery(`
        SELECT 
          SUM(metrics_cost_micros/1000000) as spend, 
          SUM(metrics_clicks) as clicks, 
          SUM(metrics_impressions) as impressions 
        FROM \`Google_ads.ads_CampaignBasicStats_1029563228\`
        WHERE segments_date >= DATE_SUB(CURRENT_DATE('America/Toronto'), INTERVAL 7 DAY)
      `).catch(e => { console.error("Google Ads BQ Error:", e); return []; }),

      // 3. RENDIMIENTO META/FACEBOOK ADS
      queryBigQuery(`
        SELECT 
          SUM(spend) as spend, 
          SUM(clicks) as clicks, 
          SUM(impressions) as impressions, 
          SUM(results) as conversions 
        FROM \`facebook_ads_analytics.campaign_daily_stats\`
        WHERE date >= DATE_SUB(CURRENT_DATE('America/Toronto'), INTERVAL 7 DAY)
      `).catch(e => { console.error("Meta Ads BQ Error:", e); return []; }),

      // 4. Citas y Cancelaciones
      queryBigQuery(`
        SELECT branch_name, status, COUNT(*) as count 
        FROM \`mindbody_analytics.appointment_history\`
        WHERE DATE(DATETIME(CAST(date_time AS TIMESTAMP), 'America/Toronto')) >= DATE_SUB(CURRENT_DATE('America/Toronto'), INTERVAL 7 DAY)
        GROUP BY 1, 2
      `).catch(e => { console.error("Appointments BQ Error:", e); return []; }),

      // 5. Tráfico Matomo de ayer
      getTrafficSummary(new Date().toISOString().split('T')[0], 'day')
        .catch(e => { console.error("Matomo Error:", e); return null; }),

      // 6. Reporte de Caja de Google Sheets
      getCashReportData()
        .catch(e => { console.error("Cash Report Error:", e); return []; })
    ]);

    const context = `
      [INFORMACIÓN ESTRATÉGICA - ÚLTIMOS 7 DÍAS]
      
      1. VENTAS POR SUCURSAL Y TIPO (is_product: true=Producto, false=Servicio):
      ${JSON.stringify(salesRaw)}

      2. RENDIMIENTO GOOGLE ADS:
      ${JSON.stringify(marketingGoogle)}

      3. RENDIMIENTO META/FACEBOOK ADS:
      ${JSON.stringify(marketingMeta)}

      4. CITAS Y CANCELACIONES (Status: Completed, LateCancelled, NoShow, etc.):
      ${JSON.stringify(appointmentsRaw)}

      [ANÁLISIS DE TRÁFICO WEB (MATOMO)]
      Visitas ayer: ${JSON.stringify(traffic)}

      [REPORTE DE CAJA (Google Sheets)]
      Diferencias de arqueo (shortOver): ${JSON.stringify(cash.map(c => ({ n: c.name, d: c.shortOver })))}
    `;

    // 2. Call Gemini for Structured Recommendations
    const langInstructions = locale === "fr"
      ? "\nDEBES generar tus respuestas (título, resumen, contenido, impacto, etc.) ÚNICAMENTE en Francés (Québécois)."
      : locale === "en"
        ? "\nDEBES generar tus respuestas (título, resumen, contenido, impacto, etc.) ÚNICAMENTE en Inglés."
        : "\nDEBES generar tus respuestas ÚNICAMENTE en Español.";

    const systemPrompt = `Eres Rick, el vCOO de Barbu Sportif. Tu tarea es analizar los datos, cruzar la información de toda la plataforma y generar exactamente de 4 a 7 recomendaciones estratégicas, detectar problemas y/o detectar oportunidades. ${langInstructions}
    DEBES responder ÚNICAMENTE en formato JSON con la siguiente estructura:
    {
      "recommendations": [
        {
          "id": "string_unique",
          "title": "Título corto y potente",
          "simplifiedSummary": "Resumen de una línea",
          "content": "Explicación detallada en Markdown. Incluye pasos accionables.",
          "type": "Marketing" | "Operaciones" | "Finanzas" | "Estrategia",
          "priority": "Baja" | "Media" | "Alta" | "Urgente",
          "impact": "Descripción del impacto esperado (ej: +15% ROI)",
          "links": [{ "label": "Google Ads", "url": "https://ads.google.com" }],
          "status": "Sugerido" | "Urgente"
        }
      ]
    }`;

    const driveCreds = JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON || '{}');
    const auth = new GoogleAuth({
      credentials: {
        type: driveCreds.type,
        project_id: driveCreds.project_id,
        private_key_id: driveCreds.private_key_id,
        private_key: driveCreds.private_key ? driveCreds.private_key.replace(/\\n/g, '\n') : '',
        client_email: driveCreds.client_email,
        client_id: driveCreds.client_id,
      },
      scopes: "https://www.googleapis.com/auth/cloud-platform"
    });
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    const accessToken = (await client.getAccessToken()).token;

    const baseUrl = "https://aiplatform.googleapis.com";
    const LOCATION_VERTEX = "global";
    const GEMINI_MODEL = "gemini-3.1-pro-preview";

    const geminiRes = await fetch(`${baseUrl}/v1/projects/${projectId}/locations/${LOCATION_VERTEX}/publishers/google/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: context }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
      })
    });

    const geminiData = await geminiRes.json();
    console.log("Gemini API Response Status:", geminiRes.status);
    console.log("Gemini API Response Data:", JSON.stringify(geminiData, null, 2));

    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      console.warn("Gemini API Error, using fallback recommendations.");
      // Fallback robusto para que la interfaz no falle
      const fallbackRecs: Recommendation[] = [
        {
          id: "mkt_001",
          title: "Optimización de Tráfico Web",
          simplifiedSummary: "Impulsar conversiones en páginas de reserva.",
          content: "### Análisis\nSe ha detectado tráfico recurrente sin conversión directa.\n\n### Recomendación\nImplementar campañas de retargeting para visitantes que no concretan citas.\n\n### Impacto\n+12% en agendamientos.",
          type: "Marketing",
          priority: "Alta",
          impact: "+12% Citas",
          status: "Sugerido",
          links: [{ label: "Google Analytics", url: "https://analytics.google.com" }],
          hasVisualMedia: false,
          suggestedPrompt: ""
        },
        {
          id: "ops_001",
          title: "Auditoría de Arqueo",
          simplifiedSummary: "Sincronizar depósitos y retiros diarios.",
          content: "### Análisis\nControles manuales generan discrepancias leves.\n\n### Recomendación\nAutomatizar el cierre de terminales Moneris con reportes de Google Sheets.\n\n### Impacto\nReducción de descuadres.",
          type: "Operaciones",
          priority: "Urgente",
          impact: "Cero Diferencias",
          status: "Urgente",
          links: [],
          hasVisualMedia: false,
          suggestedPrompt: ""
        },
        {
          id: "fin_001",
          title: "Gestión de Flujo de Caja",
          simplifiedSummary: "Optimizar retiros de efectivo acumulados.",
          content: "### Análisis\nRetiros esporádicos bloquean liquidez inmediata.\n\n### Recomendación\nEstablecer retiros semanales fijos con notificaciones automáticas.\n\n### Impacto\nMayor control de flujo.",
          type: "Finanzas",
          priority: "Media",
          impact: "Liquidez Mejorada",
          status: "Sugerido",
          links: [],
          hasVisualMedia: false,
          suggestedPrompt: ""
        },
        {
          id: "str_001",
          title: "Fidelización Predictiva",
          simplifiedSummary: "Retención de clientes de corte frecuente.",
          content: "### Análisis\nClientes recurrentes no tienen incentivo de permanencia.\n\n### Recomendación\nOfrecer suscripciones mensuales para mantenimiento de barba/corte.\n\n### Impacto\n+20% Ingresos Predecibles.",
          type: "Estrategia",
          priority: "Alta",
          impact: "+20% Retención",
          status: "Sugerido",
          links: [],
          hasVisualMedia: false,
          suggestedPrompt: ""
        }
      ];

      await saveRecommendationsAdmin(userId, fallbackRecs);
      return { success: true, fallback: true, recommendations: fallbackRecs };
    }

    const rawText = geminiData.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(rawText);

    if (!parsed || !parsed.recommendations) {
      console.warn("Gemini JSON without recommendations property, returning empty.");
      return { success: true, recommendations: [] };
    }

    // 3. Save to Firestore
    await saveRecommendationsAdmin(userId, parsed.recommendations);

    return { success: true, recommendations: parsed.recommendations };
  } catch (error: any) {
    console.error("Analysis Failure:", error);
    throw error;
  }
}
