import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedApiKey = process.env.DASHBOARD_API_KEY;

    if (!expectedApiKey || authHeader !== expectedApiKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const payload = await request.json();
    const { camera, data, detections, timestamp } = payload;

    if (!camera) {
      return NextResponse.json({ error: 'Falta el ID de cámara' }, { status: 400 });
    }

    let finalDetections = [];

    // 1. If payload comes from worker (using 'detections' list directly)
    if (Array.isArray(detections)) {
      finalDetections = detections.map((det: any) => ({
        label: det.label || 'Objeto',
        box: det.box || [0, 0, 0, 0],
        confidence: det.confidence || 1.0,
        track_id: det.track_id !== undefined ? det.track_id : -1
      }));
    }
    // 2. If payload comes from legacy format (using 'data' bucket with parallel arrays)
    else if (data && typeof data === 'object') {
      const bboxes = data.bboxes || [];
      const labels = data.labels || [];
      finalDetections = labels.map((label: string, index: number) => ({
        label,
        box: bboxes[index] || [0, 0, 0, 0],
        confidence: 1.0
      }));
    }

    const cameraData = {
      detections: finalDetections,
      timestamp: timestamp || Date.now() / 1000,
      updated_at: new Date()
    };

    const db = getAdminDb();
    await db.collection("vision_detections").doc(camera).set(cameraData, { merge: true });

    return NextResponse.json({ success: true, message: `Datos actualizados para: ${camera}` }, { status: 200 });

  } catch (error) {
    console.error('API Error (Vision POST):', error);
    return NextResponse.json({ error: 'Error procesando la actualización de visión' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const camera = searchParams.get('camera');

    if (!camera) {
      return NextResponse.json({ error: 'Se requiere el parámetro camera (?camera=id)' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = await db.collection("vision_detections").doc(camera).get();

    let cameraData = { detections: [], timestamp: 0 };
    if (docRef.exists) {
      cameraData = docRef.data() as any;
    }

    return NextResponse.json(cameraData, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });

  } catch (error) {
    console.error('API Error (Vision GET):', error);
    return NextResponse.json({ error: 'Error recuperando datos de visión' }, { status: 500 });
  }
}
