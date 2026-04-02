import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

const SESSION_DOC = 'vision_config/active_session';
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY;

// =========================================================================
// POST — Called by the Dashboard to start/stop a vision session
// =========================================================================
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = request.headers.get('x-session-token'); // lightweight token from frontend

    // Accept either the dashboard API key OR the session token (internal call)
    const isAuthorized =
      authHeader === DASHBOARD_API_KEY || token === process.env.SESSION_SECRET;

    if (!isAuthorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const payload = await request.json();
    const { cameras, action } = payload;

    const db = getAdminDb();
    const docRef = db.doc(SESSION_DOC);

    if (action === 'stop') {
      // Clear the session — GPU will pick this up and stop all threads
      await docRef.set({
        cameras: [],
        active: false,
        stopped_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, message: 'Sesión de visión detenida.' });
    }

    // action === 'start' or update
    if (!Array.isArray(cameras) || cameras.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de cámaras no vacío.' }, { status: 400 });
    }

    // Limit to 2 cameras max (dashboard limit)
    const activeCameras = cameras.slice(0, 2);

    await docRef.set({
      cameras: activeCameras,
      active: true,
      started_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Sesión activa para: ${activeCameras.join(', ')}`,
      cameras: activeCameras,
    });

  } catch (error) {
    console.error('API Error (Vision Session POST):', error);
    return NextResponse.json({ error: 'Error gestionando la sesión de visión' }, { status: 500 });
  }
}

// =========================================================================
// GET — Polled by the GPU worker every ~3 seconds to know what to process
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
