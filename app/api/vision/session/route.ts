import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

const SESSION_DOC = 'vision_config/active_session';
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY;

// Florence2 GPU server (Vast.ai) — direct push, no polling
const FLORENCE2_API_URL = process.env.FLORENCE2_API_URL;
const FLORENCE2_API_KEY = process.env.AI_API_KEY;

// =========================================================================
// notifyFlorence2 — pushes start/stop command directly to the GPU server
// Fire-and-forget: we don't block the response on this
// =========================================================================
async function notifyFlorence2(action: 'start' | 'stop', cameras: string[] = []) {
  if (!FLORENCE2_API_URL) {
    console.warn('[VisionSession] FLORENCE2_API_URL not configured — skipping GPU notify');
    return;
  }

  const endpoint = action === 'start' ? '/session/start' : '/session/stop';
  const url = `${FLORENCE2_API_URL}${endpoint}`;

  try {
    const body = action === 'start' ? JSON.stringify({ cameras }) : '{}';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': FLORENCE2_API_KEY || '',
      },
      body,
      // Short timeout — we don't want Cloud Run to hang waiting for GPU
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[VisionSession] Florence2 ${endpoint} responded ${res.status}`);
    } else {
      const data = await res.json();
      console.log(`[VisionSession] Florence2 ${action} OK:`, data);
    }
  } catch (err) {
    // Non-fatal: if GPU server is unreachable, log it but don't fail the dashboard session
    console.warn(`[VisionSession] Could not reach Florence2 server (${action}):`, err);
  }
}

// =========================================================================
// POST — Called by the Dashboard to start/stop a vision session
// =========================================================================
export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const authHeader = request.headers.get('Authorization');
    const token = request.headers.get('x-session-token'); // lightweight token from frontend

    // Accept either the dashboard API key OR the session token (internal call)
    const isAuthorized =
      authHeader === DASHBOARD_API_KEY || token === process.env.SESSION_SECRET;

    console.log(`[VisionSession] Request from ${ip} | UA: ${userAgent} | Authorized: ${isAuthorized}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const payload = await request.json();
    const { cameras, action } = payload;

    const db = getAdminDb();
    const docRef = db.doc(SESSION_DOC);

    if (action === 'stop') {
      // 1. Update Firestore
      await docRef.set({
        cameras: [],
        active: false,
        stopped_at: new Date().toISOString(),
      });

      // 2. Notify Florence2 GPU server to stop all threads (fire-and-forget)
      notifyFlorence2('stop');

      return NextResponse.json({ success: true, message: 'Sesión de visión detenida.' });
    }

    // action === 'start' or update
    if (!Array.isArray(cameras) || cameras.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de cámaras no vacío.' }, { status: 400 });
    }

    // Limit to 2 cameras max (dashboard limit)
    const activeCameras = cameras.slice(0, 2);

    // 1. Update Firestore (session record)
    await docRef.set({
      cameras: activeCameras,
      active: true,
      started_at: new Date().toISOString(),
    });

    // 2. Notify Florence2 GPU server to start processing (fire-and-forget, non-blocking)
    notifyFlorence2('start', activeCameras);

    return NextResponse.json({
      success: true,
      message: `Sesión activa para: ${activeCameras.join(', ')}`,
      cameras: activeCameras,
    });

  } catch (error) {
    console.error('API Error (Vision Session POST):', error);
    return NextResponse.json({ error: 'Error gestionando la sesión de visión' }, { status: 500 })
  }
}

// =========================================================================
// GET — Status check (for debugging / health checks only)
// The GPU worker NO LONGER polls this endpoint.
// =========================================================================
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');

    if (!DASHBOARD_API_KEY || authHeader !== DASHBOARD_API_KEY) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = getAdminDb();
    const doc = await db.doc(SESSION_DOC).get();

    if (!doc.exists) {
      return NextResponse.json({ active: false, cameras: [] });
    }

    const data = doc.data()!;
    return NextResponse.json(
      { active: data.active ?? false, cameras: data.cameras ?? [] },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      }
    );

  } catch (error) {
    console.error('API Error (Vision Session GET):', error);
    return NextResponse.json({ error: 'Error leyendo sesión activa' }, { status: 500 });
  }
}
