import { NextRequest, NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { auth } from "@/lib/firebase-admin";
import { getMailgunStats } from "@/lib/mailgun";
import { getServerCache, setServerCache } from "@/lib/server-cache";

const PROJECT_ID = "barbu-sportif-ai-center";
const bigquery = new BigQuery({ projectId: PROJECT_ID });

const ESTIMATED_REVENUE_PER_CONVERSION = 55; 
const MAILGUN_COST_PER_1000 = 1.0; // Costo estimado por cada 1k mails

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No credentials" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];

    try {
      await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // --- LOGICA DE PERIODOS ---
    const period = req.nextUrl.searchParams.get("period") || "30d";
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";

    // Intentar obtener de caché si no se pide refrescar
    const cacheKey = `marketing_${period}`;
    if (!refresh) {
      const cachedData = await getServerCache(cacheKey);
      if (cachedData) {
        return NextResponse.json(cachedData);
      }
    }
    const today = new Date();
    let days = 30;
    if (period === "7d") days = 7;
    if (period === "90d") days = 90;
    if (period === "year") days = 365;

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    const prevStartDate = new Date(today);
    prevStartDate.setDate(today.getDate() - (days * 2));

    const startDateStr = startDate.toISOString().split('T')[0];
    const prevStartDateStr = prevStartDate.toISOString().split('T')[0];
    const midDateStr = startDateStr;

    // --- QUERIES ---

    // 1. Meta Ads Stats
    const metaStatsQuery = `
      SELECT 
        campaign_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(results) as conversions,
        CASE WHEN date >= '${startDateStr}' THEN 'current' ELSE 'previous' END as period
      FROM \`${PROJECT_ID}.facebook_ads_analytics.campaign_daily_stats\`
      WHERE date >= '${prevStartDateStr}'
      GROUP BY campaign_name, period
    `;

    // 2. Google Ads Stats
    const googleStatsQuery = `
      SELECT 
        c.campaign_name,
        SUM(s.metrics_cost_micros / 1000000) as spend,
        SUM(s.metrics_impressions) as impressions,
        SUM(s.metrics_clicks) as clicks,
        SUM(s.metrics_conversions) as conversions,
        CASE WHEN s.segments_date >= '${startDateStr}' THEN 'current' ELSE 'previous' END as period
      FROM \`${PROJECT_ID}.Google_ads.p_ads_CampaignStats_1029563228\` s
      JOIN (
        SELECT campaign_id, MAX(campaign_name) as campaign_name
        FROM \`${PROJECT_ID}.Google_ads.p_ads_Campaign_1029563228\`
        GROUP BY campaign_id
      ) c ON s.campaign_id = c.campaign_id
      WHERE s.segments_date >= '${prevStartDateStr}'
      GROUP BY c.campaign_name, period
    `;

    const [metaRawRows] = await bigquery.query(metaStatsQuery);
    const [googleRawRows] = await bigquery.query(googleStatsQuery);
    
    // Mailgun Stats
    const mailgunCurrent = await getMailgunStats(startDateStr, today.toISOString().split('T')[0]);
    const mailgunPrev = await getMailgunStats(prevStartDateStr, startDateStr);

    const processMailgun = (statsList: any) => {
      // The /stats/total API returns { stats: [ { time: ..., accepted: { total: X }, delivered: { total: Y }, ... } ] }
      if (!statsList || !statsList.stats || !Array.isArray(statsList.stats)) {
        return { reach: 0, clicks: 0, opens: 0, spend: 0, conversions: 0 };
      }
      
      const stats = statsList.stats.reduce((acc: any, curr: any) => {
        acc.delivered += curr.delivered?.total || 0;
        acc.opened += curr.opened?.total || 0;
        acc.clicked += curr.clicked?.total || 0;
        acc.accepted += curr.accepted?.total || 0;
        return acc;
      }, { delivered: 0, opened: 0, clicked: 0, accepted: 0 });

      return {
        reach: stats.delivered,
        clicks: stats.clicked,
        opens: stats.opened,
        spend: (stats.accepted / 1000) * MAILGUN_COST_PER_1000,
        conversions: Math.floor(stats.clicked * 0.05)
      };
    };

    const mgCurrent = processMailgun(mailgunCurrent);
    const mgPrev = processMailgun(mailgunPrev);

    // --- PROCESAMIENTO ---

    const currentMeta = metaRawRows.filter(r => r.period === 'current');
    const prevMeta = metaRawRows.filter(r => r.period === 'previous');
    const currentGoogle = googleRawRows.filter(r => r.period === 'current');
    const prevGoogle = googleRawRows.filter(r => r.period === 'previous');

    const sumMetrics = (rows: any[]) => rows.reduce((acc, r) => {
      acc.spend += r.spend || 0;
      acc.impressions += r.impressions || 0;
      acc.clicks += r.clicks || 0;
      acc.conversions += r.conversions || 0;
      return acc;
    }, { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

    const metaTotals = sumMetrics(currentMeta);
    const prevMetaTotals = sumMetrics(prevMeta);
    const googleTotals = sumMetrics(currentGoogle);
    const prevGoogleTotals = sumMetrics(prevGoogle);

    const totalReach = metaTotals.impressions + googleTotals.impressions + mgCurrent.reach;
    const prevTotalReach = prevMetaTotals.impressions + prevGoogleTotals.impressions + mgPrev.reach;
    const reachGrowth = prevTotalReach > 0 ? ((totalReach - prevTotalReach) / prevTotalReach) * 100 : 0;

    const totalClicks = metaTotals.clicks + googleTotals.clicks + mgCurrent.clicks;
    const avgEngagement = totalReach > 0 ? (totalClicks / totalReach) * 100 : 0;
    
    const prevTotalClicks = prevMetaTotals.clicks + prevGoogleTotals.clicks + mgPrev.clicks;
    const prevAvgEngagement = prevTotalReach > 0 ? (prevTotalClicks / prevTotalReach) * 100 : 0;
    const engagementGrowth = avgEngagement - prevAvgEngagement;

    const totalSpend = metaTotals.spend + googleTotals.spend + mgCurrent.spend;
    const totalResults = metaTotals.conversions + googleTotals.conversions + mgCurrent.conversions;
    const totalRevenue = totalResults * ESTIMATED_REVENUE_PER_CONVERSION;
    const avgRoi = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const prevTotalSpend = prevMetaTotals.spend + prevGoogleTotals.spend + mgPrev.spend;
    const prevTotalResults = prevMetaTotals.conversions + prevGoogleTotals.conversions + mgPrev.conversions;
    const prevTotalRevenue = prevTotalResults * ESTIMATED_REVENUE_PER_CONVERSION;
    const prevAvgRoi = prevTotalSpend > 0 ? prevTotalRevenue / prevTotalSpend : 0;
    const roiGrowth = avgRoi - prevAvgRoi;

    // Daily Reach Query (Updated for period)
    const dailyReachQuery = `
      SELECT FORMAT_DATE('%d/%m', date) as day_label, date, SUM(impressions) as reach
      FROM (
        SELECT date, impressions FROM \`${PROJECT_ID}.facebook_ads_analytics.campaign_daily_stats\`
        UNION ALL
        SELECT segments_date as date, metrics_impressions as impressions FROM \`${PROJECT_ID}.Google_ads.p_ads_CampaignStats_1029563228\`
      )
      WHERE date >= DATE('${startDateStr}')
      GROUP BY date, day_label ORDER BY date ASC
    `;
    const [dailyRows] = await bigquery.query(dailyReachQuery);

    const formatCampaign = (row: any, platform: string) => ({
      name: row.campaign_name,
      platform,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      revenue: row.conversions * ESTIMATED_REVENUE_PER_CONVERSION,
      roi: row.spend > 0 ? (row.conversions * ESTIMATED_REVENUE_PER_CONVERSION) / row.spend : 0
    });

    const marketingData = {
      summary: {
        totalReach,
        reachGrowth: parseFloat(reachGrowth.toFixed(1)),
        avgEngagement: parseFloat(avgEngagement.toFixed(2)),
        engagementGrowth: parseFloat(engagementGrowth.toFixed(1)),
        avgRoi: parseFloat(avgRoi.toFixed(2)),
        roiGrowth: parseFloat(roiGrowth.toFixed(1)),
        totalSpend: parseFloat(totalSpend.toFixed(2)),
        spendGrowth: prevTotalSpend > 0 ? parseFloat(((totalSpend - prevTotalSpend) / prevTotalSpend * 100).toFixed(1)) : 0,
        activeCampaigns: currentMeta.length + currentGoogle.length + (mgCurrent.reach > 0 ? 1 : 0)
      },
      platforms: [
        { name: "Meta Ads", reach: metaTotals.impressions, engagement: metaTotals.impressions > 0 ? (metaTotals.clicks / metaTotals.impressions) * 100 : 0, color: "#3b82f6" },
        { name: "Google Ads", reach: googleTotals.impressions, engagement: googleTotals.impressions > 0 ? (googleTotals.clicks / googleTotals.impressions) * 100 : 0, color: "#10b981" },
        { name: "Mailgun (Email)", reach: mgCurrent.reach, engagement: mgCurrent.reach > 0 ? ((mgCurrent.clicks + mgCurrent.opens) / mgCurrent.reach) * 50 : 0, color: "#f87171" }
      ],
      campaigns: {
        meta: currentMeta.map(r => formatCampaign(r, "Meta")),
        google: currentGoogle.map(r => formatCampaign(r, "Google")),
        mailgun: mgCurrent.reach > 0 ? [{
          name: "Bulk Email Communication",
          platform: "Mailgun",
          spend: mgCurrent.spend,
          impressions: mgCurrent.reach,
          clicks: mgCurrent.clicks,
          conversions: mgCurrent.conversions,
          revenue: mgCurrent.conversions * ESTIMATED_REVENUE_PER_CONVERSION,
          roi: mgCurrent.spend > 0 ? (mgCurrent.conversions * ESTIMATED_REVENUE_PER_CONVERSION) / mgCurrent.spend : 0
        }] : []
      },
      dailyReach: dailyRows.map(r => ({ date: r.day_label, reach: r.reach }))
    };

    await setServerCache(cacheKey, marketingData);
    return NextResponse.json(marketingData);
  } catch (error: any) {
    console.error("Error Marketing Dashboard API:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
