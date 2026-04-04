import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Heartbeat proxy — mantiene viva la sesión en Florence2 mientras el dashboard está abierto.
 * El dashboard lo llama cada 20s. Si Florence2 no recibe heartbeat en 45s, para las cámaras.
 */
export async function POST(req: NextRequest) {
  const FLORENCE2_API_URL = process.env.FLORENCE2_API_URL;
  const FLORENCE2_API_KEY = process.env.AI_API_KEY;

  if (!FLORENCE2_API_URL) {
    // Silencioso si no está configurado — no romper el dashboard
    return NextResponse.json({ status: 'no-gpu' });
  }

  try {
    const res = await fetch(`${FLORENCE2_API_URL}/session/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': FLORENCE2_API_KEY || '',
      },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'error', code: res.status }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Fire-and-forget — si el GPU no responde no importa
    return NextResponse.json({ status: 'unreachable' });
  }
}
