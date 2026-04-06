import { NextResponse } from 'next/server';

/**
 * GET /api/vision/config
 *
 * Expone la URL del servidor GPU al cliente sin depender de NEXT_PUBLIC_
 * (las variables NEXT_PUBLIC_ se hornean en el bundle en build-time,
 * no en runtime — por eso no funcionan con Cloud Run env vars dinámicas).
 *
 * La variable VISION_GPU_URL se lee en el servidor en cada request.
 */
export async function GET() {
  const gpuUrl = process.env.VISION_GPU_URL || process.env.NEXT_PUBLIC_VISION_GPU_URL || '';
  return NextResponse.json({ gpuUrl });
}
