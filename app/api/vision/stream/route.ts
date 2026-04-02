import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * SSE Endpoint for Real-time Vision Updates
 * This allows the browser to receive updates from Firestore instantly
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const camera = searchParams.get('camera');

  if (!camera) {
    return new Response('Missing camera parameter', { status: 400 });
  }

  const encoder = new TextEncoder();
  const db = getAdminDb();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Initial Data Fetch
      const docRef = db.collection("vision_detections").doc(camera);
      const initialDoc = await docRef.get();
      
      if (initialDoc.exists) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialDoc.data())}\n\n`));
      }

      // 2. Real-time Subscription to Firestore Changes
      const unsubscribe = docRef.onSnapshot(
        (snapshot) => {
          if (snapshot.exists) {
            const data = snapshot.data();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          }
        },
        (error) => {
          console.error("SSE Firestore Error:", error);
          controller.error(error);
        }
      );

      // 3. Clean up on close
      req.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
