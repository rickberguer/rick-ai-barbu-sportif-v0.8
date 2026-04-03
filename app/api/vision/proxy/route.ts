import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Proxy for Vision Camera MJPEG Streams
 * Bypasses Cloudflare Access by adding Service Token headers from the server.
 * This prevents the "Connection Refused" error in iframes.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const camera = searchParams.get('camera');

  if (!camera) {
    return new Response('Missing camera parameter', { status: 400 });
  }

  const cfClientId = process.env.CF_CLIENT_ID;
  const cfClientSecret = process.env.CF_CLIENT_SECRET;

  if (!cfClientId || !cfClientSecret) {
    console.error('[VisionProxy] Missing Cloudflare Access credentials');
    return new Response('Server configuration error', { status: 500 });
  }

  // Target URL: go2rtc MP4 (Fragmented MP4) stream
  const targetUrl = `https://vision.barbusportif.ca/api/stream.mp4?src=${camera}&mp4`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'CF-Access-Client-Id': cfClientId,
        'CF-Access-Client-Secret': cfClientSecret,
      },
      // IMPORTANT: Cloudflare needs to stream this without caching
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(`[VisionProxy] Failed to fetch from target: ${response.status} ${response.statusText}`);
      return new Response(`Failed to fetch stream: ${response.statusText}`, { status: response.status });
    }

    // Proxy the response body (fMP4 stream)
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error: any) {
    console.error('[VisionProxy] Error:', error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}
