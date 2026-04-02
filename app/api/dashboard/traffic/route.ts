import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { getTrafficSummary, getTopPages, getTopCountries, getVisitsEvolution, getReferrerTypes, getSocialReferrers, getCampaigns } from "@/lib/matomo";
import { getServerCache, setServerCache } from "@/lib/server-cache";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No credentials" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];

    // Check Cache
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const cacheKey = "traffic";
    if (!refresh) {
      const cachedData = await getServerCache(cacheKey);
      if (cachedData) return NextResponse.json(cachedData);
    }

    try {
      // Decode locally if project matching fails in dev, same as financial panel
      try {
        await auth.verifyIdToken(token);
      } catch (e: any) {
        if (e.code === "auth/argument-error" || e.message?.includes("audience")) {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const payload = JSON.parse(jsonPayload);
          if (payload.exp * 1000 < Date.now()) throw new Error("Token expired");
        } else {
          throw e;
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Default to last30 for evolution and this month for summary in dashboard
    const summary = await getTrafficSummary("last30", "range");
    const summaryPrev = await getTrafficSummary("previous30", "range");
    const topPages = await getTopPages("last30", "range");
    const topCountries = await getTopCountries("last30", "range");
    const evolution = await getVisitsEvolution("last30", "day");
    const referrers = await getReferrerTypes("last30", "range");
    const socials = await getSocialReferrers("last30", "range");
    const campaigns = await getCampaigns("last30", "range");

    // Calculation for growth
    const calcGrowth = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;

    const result = {
      summary: {
        visits: summary.visitas,
        visitsGrowth: calcGrowth(summary.visitas, summaryPrev.visitas),
        pageviews: summary.acciones_pageviews,
        pageviewsGrowth: calcGrowth(summary.acciones_pageviews, summaryPrev.acciones_pageviews),
        uniqueUsers: summary.usuarios_unicos,
        uniqueVisitorsGrowth: calcGrowth(summary.usuarios_unicos, summaryPrev.usuarios_unicos),
        bounceRate: summary.tasa_rebote, // usually strings like "34%"
        avgTime: summary.duracion_promedio_segundos,
      },
      topPages,
      topCountries,
      evolution,
      referrers,
      socials,
      campaigns
    };

    await setServerCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error Traffic Dashboard API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
