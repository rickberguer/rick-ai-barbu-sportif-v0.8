import { NextRequest, NextResponse } from "next/server";
import { exchangeTikTokCode } from "@/lib/tiktok";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('auth_code') || searchParams.get('code'); // TikTok suele enviar 'auth_code'

  if (!code) {
    return NextResponse.json({ error: "Falta el parámetro 'auth_code' o 'code' en la URL." }, { status: 400 });
  }

  try {
    const result = await exchangeTikTokCode(code);
    return NextResponse.json({
      success: true,
      message: "TikTok Business API autenticado correctamente para Rick.",
      advertiser_ids: result.advertiser_ids
    }, { status: 200 });

  } catch (error: any) {
    console.error("[Auth TikTok Callback] Error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Error desconocido al intercambiar el token."
    }, { status: 500 });
  }
}
