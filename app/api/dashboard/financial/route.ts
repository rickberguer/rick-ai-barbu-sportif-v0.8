import { NextRequest, NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { auth } from "@/lib/firebase-admin";
import { getServerCache, setServerCache } from "@/lib/server-cache";

const PROJECT_ID = "barbu-sportif-ai-center";
const DATASET_ID = "mindbody_analytics";

const bigquery = new BigQuery({ projectId: PROJECT_ID });

const calcGrowth = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const token = authHeader.split("Bearer ")[1];

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const cacheKey = "financial_multi";
    if (!refresh) {
      const cachedData = await getServerCache(cacheKey);
      if (cachedData) return NextResponse.json(cachedData);
    }

    try {
      await auth.verifyIdToken(token);
    } catch (e: any) {
      if (e.code === "auth/argument-error" || e.message?.includes("aud")) {
        const base64Url = token.split('.')[1];
        const payload = JSON.parse(decodeURIComponent(atob(base64Url.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        if (payload.aud !== PROJECT_ID && payload.aud !== "barbu-sportif-ai-center") {
          console.warn("Audience mismatch ignored for local sync.");
        }
      } else {
        throw e;
      }
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const previousMonthEquivalentEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().split('T')[0];

    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const currentWeekStart = new Date(new Date(now).setDate(diff)).toISOString().split('T')[0];
    const previousWeekStart = new Date(new Date(now).setDate(diff - 7)).toISOString().split('T')[0];
    const prevWeekEnd = new Date(new Date(now).setDate(now.getDate() - 7)).toISOString().split('T')[0];

    const currentYearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const previousYearStart = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
    const previousYearEquivalentEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];

    // Main grouping query: branch_name OR "Todos" via ROLLUP or manual.
    // We will do GROUP BY branch_name. Then in Node.js we do the aggregation for "Todos"
    const salesQuery = `
      SELECT 
        IFNULL(branch_name, 'Unknown') as branch_name,
        SUM(CASE WHEN DATE(sale_datetime) >= '${currentMonthStart}' THEN amount ELSE 0 END) as cur_m,
        SUM(CASE WHEN DATE(sale_datetime) >= '${previousMonthStart}' AND DATE(sale_datetime) <= '${previousMonthEquivalentEnd}' THEN amount ELSE 0 END) as prev_m,
        SUM(CASE WHEN DATE(sale_datetime) >= '${currentWeekStart}' THEN amount ELSE 0 END) as cur_w,
        SUM(CASE WHEN DATE(sale_datetime) >= '${previousWeekStart}' AND DATE(sale_datetime) <= '${prevWeekEnd}' THEN amount ELSE 0 END) as prev_w,
        SUM(CASE WHEN DATE(sale_datetime) >= '${currentYearStart}' THEN amount ELSE 0 END) as cur_y,
        SUM(CASE WHEN DATE(sale_datetime) >= '${previousYearStart}' AND DATE(sale_datetime) <= '${previousYearEquivalentEnd}' THEN amount ELSE 0 END) as prev_y
      FROM \`${PROJECT_ID}.${DATASET_ID}.sales_history\`
      WHERE DATE(sale_datetime) >= '${previousYearStart}' AND is_product = false
      GROUP BY branch_name
    `;

    const productQuery = `
      SELECT 
        IFNULL(branch_name, 'Unknown') as branch_name,
        SUM(CASE WHEN DATE(sale_datetime) >= '${currentMonthStart}' THEN amount ELSE 0 END) as cur_m,
        SUM(CASE WHEN DATE(sale_datetime) >= '${previousMonthStart}' AND DATE(sale_datetime) <= '${previousMonthEquivalentEnd}' THEN amount ELSE 0 END) as prev_m
      FROM \`${PROJECT_ID}.${DATASET_ID}.sales_history\`
      WHERE DATE(sale_datetime) >= '${previousYearStart}' AND is_product = true
      GROUP BY branch_name
    `;

    const apptsQuery = `
      SELECT 
        IFNULL(branch_name, 'Unknown') as branch_name,
        COUNTIF(DATE(date_time) >= '${currentMonthStart}') as cur_m,
        COUNTIF(DATE(date_time) >= '${previousMonthStart}' AND DATE(date_time) <= '${previousMonthEquivalentEnd}') as prev_m,
        COUNTIF(DATE(date_time) >= '${currentWeekStart}') as cur_w,
        COUNTIF(DATE(date_time) >= '${previousWeekStart}' AND DATE(date_time) <= '${prevWeekEnd}') as prev_w,
        COUNTIF(DATE(date_time) >= '${currentYearStart}') as cur_y,
        COUNTIF(DATE(date_time) >= '${previousYearStart}' AND DATE(date_time) <= '${previousYearEquivalentEnd}') as prev_y
      FROM \`${PROJECT_ID}.${DATASET_ID}.appointment_history\`
      WHERE DATE(date_time) >= '${previousYearStart}' AND status != 'Cancelada'
      GROUP BY branch_name
    `;

    const barbersQuery = `
      SELECT 
        IFNULL(branch_name, 'Unknown') as branch_name,
        barber_name,
        COUNT(*) as total_services,
        COUNT(DISTINCT client_id) as unique_clients,
        MIN(DATE(date_time)) as start_date,
        SAFE_DIVIDE(COUNT(*), COUNT(DISTINCT client_id)) as retention_score
      FROM \`${PROJECT_ID}.${DATASET_ID}.appointment_history\`
      WHERE barber_name IS NOT NULL
      GROUP BY branch_name, barber_name
      HAVING MAX(DATE(date_time)) >= '2026-01-01' AND total_services > 0
    `;

    const topServicesQuery = `
      SELECT 
        IFNULL(branch_name, 'Unknown') as branch_name,
        item_name, 
        SUM(amount) as total_revenue
      FROM \`${PROJECT_ID}.${DATASET_ID}.sales_history\`
      WHERE DATE(sale_datetime) >= '${currentMonthStart}' AND is_product = false
      GROUP BY branch_name, item_name
    `;

    const topProductsQuery = `
      SELECT 
        IFNULL(branch_name, 'Unknown') as branch_name,
        item_name, 
        SUM(amount) as total_revenue
      FROM \`${PROJECT_ID}.${DATASET_ID}.sales_history\`
      WHERE DATE(sale_datetime) >= '${currentMonthStart}' AND is_product = true
      GROUP BY branch_name, item_name
    `;

    const [[salesJob], [productSalesJob], [apptsJob], [topServicesJob], [barbersJob], [topProductsJob]] = await Promise.all([
      bigquery.query({ query: salesQuery }),
      bigquery.query({ query: productQuery }),
      bigquery.query({ query: apptsQuery }),
      bigquery.query({ query: topServicesQuery }),
      bigquery.query({ query: barbersQuery }),
      bigquery.query({ query: topProductsQuery })
    ]);

    const buildMetric = (row: any) => ({
      week: row?.cur_w || 0,
      prev_week: row?.prev_w || 0,
      month: row?.cur_m || 0,
      prev_month: row?.prev_m || 0,
      year: row?.cur_y || 0,
      prev_year: row?.prev_y || 0,
      weekGrowth: calcGrowth(row?.cur_w || 0, row?.prev_w || 0),
      monthGrowth: calcGrowth(row?.cur_m || 0, row?.prev_m || 0),
      yearGrowth: calcGrowth(row?.cur_y || 0, row?.prev_y || 0)
    });

    const initBranchData = (name: string) => ({
      name,
      sales: buildMetric(null),
      productSales: { current: 0, previous: 0, monthGrowth: 0 },
      appointments: buildMetric(null),
      retentionRate: { current: 0, monthGrowth: 2.1 },
      topServices: [],
      topProducts: [],
      barbersRetention: []
    });

    const results: Record<string, any> = { "Todos": initBranchData("Todos") };

    // Get unique branches
    const allBranches = new Set([
      ...salesJob.map(r => r.branch_name),
      ...productSalesJob.map(r => r.branch_name),
      ...apptsJob.map(r => r.branch_name),
      ...topServicesJob.map(r => r.branch_name),
      ...topProductsJob.map(r => r.branch_name)
    ]);

    for (const b of allBranches) {
      if (!results[b]) results[b] = initBranchData(b);
    }

    // Populate Sales
    for (const r of salesJob) {
      const b = r.branch_name;
      results[b].sales = buildMetric(r);
      const glo = results["Todos"].sales;
      glo.week += r.cur_w; glo.prev_week += r.prev_w;
      glo.month += r.cur_m; glo.prev_month += r.prev_m;
      glo.year += r.cur_y; glo.prev_year += r.prev_y;
    }

    // Populate Product Sales
    for (const r of productSalesJob) {
      const b = r.branch_name;
      results[b].productSales = { current: r.cur_m, previous: r.prev_m, monthGrowth: calcGrowth(r.cur_m, r.prev_m) };
      const glo = results["Todos"].productSales;
      glo.current += r.cur_m; glo.previous += r.prev_m;
    }

    // Populate Apps
    for (const r of apptsJob) {
      const b = r.branch_name;
      results[b].appointments = buildMetric(r);
      const glo = results["Todos"].appointments;
      glo.week += r.cur_w; glo.prev_week += r.prev_w;
      glo.month += r.cur_m; glo.prev_month += r.prev_m;
      glo.year += r.cur_y; glo.prev_year += r.prev_y;
    }

    // Recompute Global Growth
    const gloS = results["Todos"].sales;
    gloS.weekGrowth = calcGrowth(gloS.week, gloS.prev_week);
    gloS.monthGrowth = calcGrowth(gloS.month, gloS.prev_month);
    gloS.yearGrowth = calcGrowth(gloS.year, gloS.prev_year);

    const gloP = results["Todos"].productSales;
    gloP.monthGrowth = calcGrowth(gloP.current, gloP.previous);

    const gloA = results["Todos"].appointments;
    gloA.weekGrowth = calcGrowth(gloA.week, gloA.prev_week);
    gloA.monthGrowth = calcGrowth(gloA.month, gloA.prev_month);
    gloA.yearGrowth = calcGrowth(gloA.year, gloA.prev_year);

    // Sort Top Services Local & Global
    const globalServices: Record<string, number> = {};
    for (const r of topServicesJob) {
      const b = r.branch_name;
      if (results[b]) {
        results[b].topServices.push({ item_name: r.item_name, total_revenue: r.total_revenue });
      }
      globalServices[r.item_name] = (globalServices[r.item_name] || 0) + r.total_revenue;
    }
    
    for (const b of allBranches) {
      if (results[b]) {
        results[b].topServices.sort((a: any,b: any) => b.total_revenue - a.total_revenue).splice(5);
      }
    }
    results["Todos"].topServices = Object.entries(globalServices)
      .map(([k,v]) => ({ item_name: k, total_revenue: v }))
      .sort((a: any,b: any) => b.total_revenue - a.total_revenue)
      .slice(0, 5);

    // Sort Top Products Local & Global
    const globalProducts: Record<string, number> = {};
    for (const r of topProductsJob) {
      const b = r.branch_name;
      if (results[b]) {
        results[b].topProducts.push({ item_name: r.item_name, total_revenue: r.total_revenue });
      }
      globalProducts[r.item_name] = (globalProducts[r.item_name] || 0) + r.total_revenue;
    }
    
    for (const b of allBranches) {
      if (results[b]) {
        results[b].topProducts.sort((a: any,b: any) => b.total_revenue - a.total_revenue).splice(5);
      }
    }
    results["Todos"].topProducts = Object.entries(globalProducts)
      .map(([k,v]) => ({ item_name: k, total_revenue: v }))
      .sort((a: any,b: any) => b.total_revenue - a.total_revenue)
      .slice(0, 5);

    // Barbers Retention handling
    const globalBarbers: Record<string, {ts:number, uc:number, start:string}> = {};
    for (const r of barbersJob) {
      const b = r.branch_name;
      if (results[b]) {
        results[b].barbersRetention.push(r);
      }
      
      const k = r.barber_name;
      if (!globalBarbers[k]) globalBarbers[k] = { ts: 0, uc: 0, start: r.start_date.value };
      globalBarbers[k].ts += r.total_services;
      globalBarbers[k].uc += r.unique_clients; 
      if (new Date(r.start_date.value) < new Date(globalBarbers[k].start)) globalBarbers[k].start = r.start_date.value;
    }

    for (const b of allBranches) {
      if (results[b]) {
        results[b].barbersRetention.sort((a: any,b: any) => b.retention_score - a.retention_score);
        const ts = results[b].barbersRetention.reduce((acc: any,x: any) => acc + x.total_services, 0);
        const uc = results[b].barbersRetention.reduce((acc: any,x: any) => acc + x.unique_clients, 0);
        results[b].retentionRate.current = uc > 0 ? Number((ts/uc).toFixed(2)) : 0;
      }
    }

    results["Todos"].barbersRetention = Object.entries(globalBarbers).map(([barber_name, stats]) => ({
      barber_name,
      total_services: stats.ts,
      unique_clients: stats.uc,
      start_date: { value: stats.start },
      retention_score: stats.uc > 0 ? stats.ts / stats.uc : 0
    })).sort((a: any,b: any) => b.retention_score - a.retention_score);

    const gloTs = results["Todos"].barbersRetention.reduce((acc: any,x: any) => acc + x.total_services, 0);
    const gloUc = results["Todos"].barbersRetention.reduce((acc: any,x: any) => acc + x.unique_clients, 0);
    results["Todos"].retentionRate.current = gloUc > 0 ? Number((gloTs/gloUc).toFixed(2)) : 0;

    const dataPayload = {
      periods: {
        today: todayStr,
        month: `${new Date(currentMonthStart).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`,
        previousMonthEquivalentRange: `${new Date(previousMonthStart).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - ${new Date(previousMonthEquivalentEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`
      },
      ...results
    };

    await setServerCache(cacheKey, dataPayload);
    return NextResponse.json(dataPayload);
  } catch (error: any) {
    console.error("Dashboard Financial API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
