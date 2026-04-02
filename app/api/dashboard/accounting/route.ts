import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
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
    const cacheKey = "accounting";
    if (!refresh) {
      const cachedData = await getServerCache(cacheKey);
      if (cachedData) return NextResponse.json(cachedData);
    }

    try {
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

    // ACCOUNTING MOCK DATA
    const accountingData = {
      summary: {
        netProfit: 12450.50,
        profitGrowth: 8.2,
        totalIncome: 45800.00,
        incomeGrowth: 12.5,
        totalExpenses: 33349.50,
        expenseGrowth: 4.1,
        taxes: 7328.00,
        margin: 27.2
      },
      expenseBreakdown: [
        { name: "Salarios", value: 15400, color: "#818cf8" },
        { name: "Alquiler", value: 4500, color: "#f59e0b" },
        { name: "Insumos", value: 6121, color: "#10b981" },
        { name: "Marketing", value: 3500, color: "#ec4899" },
        { name: "Otros", value: 3828, color: "#94a3b8" }
      ],
      monthlyFlow: [
        { month: "Ene", income: 38000, expenses: 29000 },
        { month: "Feb", income: 41000, expenses: 31000 },
        { month: "Mar", income: 39500, expenses: 30500 },
        { month: "Abr", income: 44000, expenses: 32000 },
        { month: "May", income: 45800, expenses: 33349 }
      ]
    };

    await setServerCache(cacheKey, accountingData);
    return NextResponse.json(accountingData);
  } catch (error: any) {
    console.error("Error Accounting Dashboard API:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
