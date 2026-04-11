import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/vision/heartbeat
 *
 * Proxy server-side para el heartbeat al GPU server.
 * El navegador llama aquí (same-origin, sin CORS) y este handler
 * reenvía la request al GPU con los headers de Cloudflare Access.
 * Los credentials CF nunca se exponen al cliente.
 */
export async function POST(req: NextRequest) {
  const gpuUrl = process.env.VISION_GPU_URL || '';
  const cfClientId = process.env.CF_CLIENT_ID;
  const cfClientSecret = process.env.CF_CLIENT_SECRET;

  if (!gpuUrl) {
    return NextResponse.json({ error: 'GPU URL not configured' }, { status: 503 });
  }

  if (!cfClientId || !cfClientSecret) {
    console.error('[HeartbeatProxy] Missing Cloudflare Access credentials');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const response = await fetch(`${gpuUrl}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfClientId,
        'CF-Access-Client-Secret': cfClientSecret,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });

  } catch (error: any) {
    console.error('[HeartbeatProxy] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
