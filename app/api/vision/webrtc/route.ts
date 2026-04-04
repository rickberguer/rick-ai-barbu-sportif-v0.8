import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * WebRTC SDP Signaling Proxy
 * Proxies the go2rtc WebRTC offer/answer exchange, adding Cloudflare Access headers.
 * 
 * Flow:
 *   Browser → POST /api/vision/webrtc?camera=ndp_stations (SDP offer)
 *     → go2rtc POST /api/webrtc?src=ndp_stations (SDP answer)
 *   Media then flows directly Browser ↔ go2rtc via WebRTC (DTLS/SRTP)
 */
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const camera = searchParams.get('camera');

  if (!camera) {
    return new Response('Missing camera parameter', { status: 400 });
  }

  const cfClientId = process.env.CF_CLIENT_ID;
  const cfClientSecret = process.env.CF_CLIENT_SECRET;

  if (!cfClientId || !cfClientSecret) {
    return new Response('Server configuration error', { status: 500 });
  }

  const sdpOffer = await req.text();
  const targetUrl = `https://vision.barbusportif.ca/api/webrtc?src=${camera}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'CF-Access-Client-Id': cfClientId,
        'CF-Access-Client-Secret': cfClientSecret,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
    });

    if (!response.ok) {
      console.error(`[WebRTCProxy] go2rtc responded ${response.status} for camera: ${camera}`);
      return new Response(`go2rtc error: ${response.statusText}`, { status: response.status });
    }

    const sdpAnswer = await response.text();
    return new Response(sdpAnswer, {
      status: 200,
      headers: { 'Content-Type': 'application/sdp' },
    });

  } catch (error: any) {
    console.error('[WebRTCProxy] Error:', error);
    return new Response(`Signaling error: ${error.message}`, { status: 500 });
  }
}
