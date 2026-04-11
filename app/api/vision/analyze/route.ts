import { NextRequest, NextResponse } from 'next/server';
import { getLatestFrame, analyzeFrame } from '@/services/visionService';

// URLs de frames JPEG de cada cámara (go2rtc detrás de Cloudflare Access).
// Solo incluimos las sucursales que tienen cámaras activas hoy.
// El chat agent ("mirar_sucursal") llama este endpoint con el nombre normalizado.
const BRANCH_CAMERA_URL: Record<string, string> = {
  // Notre-Dame-des-Prairies
  ndp:       'https://vision.barbusportif.ca/api/frame.jpeg?src=ndp_stations',
  ndp2:      'https://vision.barbusportif.ca/api/frame.jpeg?src=ndp_stations2',

  // Mirabel (5 cámaras)
  mirabel:   'https://vision-mirabel.barbusportif.ca/api/frame.jpeg?src=mirabel1', // alias → cam 1
  mirabel1:  'https://vision-mirabel.barbusportif.ca/api/frame.jpeg?src=mirabel1',
  mirabel2:  'https://vision-mirabel.barbusportif.ca/api/frame.jpeg?src=mirabel2',
  mirabel3:  'https://vision-mirabel.barbusportif.ca/api/frame.jpeg?src=mirabel3',
  mirabel4:  'https://vision-mirabel.barbusportif.ca/api/frame.jpeg?src=mirabel4',
  mirabel5:  'https://vision-mirabel.barbusportif.ca/api/frame.jpeg?src=mirabel5',

  // Francois (2 cámaras)
  francois:  'https://vision-francois.barbusportif.ca/api/frame.jpeg?src=francois1', // alias → cam 1
  francois1: 'https://vision-francois.barbusportif.ca/api/frame.jpeg?src=francois1',
  francois2: 'https://vision-francois.barbusportif.ca/api/frame.jpeg?src=francois2',
};

export async function POST(req: NextRequest) {
  try {
    const { branchId } = await req.json();

    const cameraUrl = branchId ? BRANCH_CAMERA_URL[branchId.toLowerCase()] : undefined;
    if (!cameraUrl) {
      return NextResponse.json(
        { error: `Invalid or unknown branch ID: ${branchId}` },
        { status: 400 },
      );
    }

    const base64Image = await getLatestFrame(cameraUrl);
    const analysis = await analyzeFrame(base64Image);

    return NextResponse.json({
      ...analysis,
      image: `data:image/jpeg;base64,${base64Image}`
    });

  } catch (error: any) {
    console.error('Vision API Error:', error);
    return NextResponse.json({
      error: 'Failed to analyze camera vision',
      details: error.message
    }, { status: 500 });
  }
}
