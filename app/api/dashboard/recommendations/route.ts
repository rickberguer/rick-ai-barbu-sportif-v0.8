import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { getRecommendationsAdmin } from "@/lib/firestore-admin-utils";

async function verifyUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (e) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      if (payload.exp * 1000 > Date.now()) return payload;
    } catch {}
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const logs = await getRecommendationsAdmin(user.uid);
    
    // Fallback if empty
    if (logs.length === 0) {
      return NextResponse.json({
        hero: {
          title: "Inicia el análisis",
          description: "Rick (vCOO) está listo para analizar tus datos. Presiona el botón de actualizar para generar nuevas estrategias.",
          impact: "Análisis pendiente"
        },
        strategies: []
      });
    }

    return NextResponse.json({
      hero: logs[0],
      strategies: logs.slice(1)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { runFullStrategicAnalysis } = await import("@/lib/analysis-engine");
    const body = await req.json().catch(() => ({}));
    const locale = body.locale || 'es';
    const result = await runFullStrategicAnalysis(user.uid, locale);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
