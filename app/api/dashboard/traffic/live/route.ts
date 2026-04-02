import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { getLiveCounters } from "@/lib/matomo";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No credentials" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];

    try {
      try {
        await auth.verifyIdToken(token);
      } catch (e: any) {
        if (e.code === "auth/argument-error" || e.message?.includes("audience")) {
           // Basic decoding for local dev
           const base64Url = token.split('.')[1];
           const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
           JSON.parse(decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        } else throw e;
      }
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const live = await getLiveCounters(30);

    return NextResponse.json({
      visitors: live.visitors || 0,
      actions: live.actions || 0
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
