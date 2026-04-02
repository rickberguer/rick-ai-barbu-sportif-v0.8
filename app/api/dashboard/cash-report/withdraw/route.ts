import { NextRequest, NextResponse } from "next/server";
import { auth, getAdminDb } from "@/lib/firebase-admin";

async function verifyUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (e) {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { shop } = await req.json();
    if (!shop) return NextResponse.json({ error: "Shop name required" }, { status: 400 });

    const db = getAdminDb();
    const today = new Date().toISOString().split('T')[0];

    await db.collection("cash_withdrawals").doc(shop).set({
      last_withdrawal: today,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return NextResponse.json({ success: true, date: today });
  } catch (error: any) {
    console.error("Error withdrawing cash:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
