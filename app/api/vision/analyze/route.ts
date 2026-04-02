import { NextRequest, NextResponse } from 'next/server';
import { getLatestFrame, analyzeFrame } from '@/services/visionService';

const BRANCHES = [
  { id: 'ndp', name: 'Notre-Dame-des-Prairies' },
  { id: 'ndp2', name: 'Notre-Dame-des-Prairies 2' },
]

const BRANCH_CAMERA_MAP: Record<string, string> = {
  mirabel: 'CAMERA_URL_MIRABEL',
  sauveur: 'CAMERA_URL_SAUVEUR',
  repen: 'CAMERA_URL_REPEN',
  joli: 'CAMERA_URL_JOLI',
  ndp: 'CAMERA_URL_NDP',
  ndp2: 'CAMERA_URL_NDP2',
  '3rcentre': 'CAMERA_URL_3RCENTRE',
  aubuchon: 'CAMERA_URL_AUBUCHON',
  quebec: 'CAMERA_URL_QUEBEC',
  terrebonne: 'CAMERA_URL_TERREBONNE',
  seigneurs: 'CAMERA_URL_SEIGNEURS',
  sorel: 'CAMERA_URL_SOREL',
  drummond: 'CAMERA_URL_DRUMMOND',
  victo: 'CAMERA_URL_VICTO',
  shawi: 'CAMERA_URL_SHAWI',
  cap: 'CAMERA_URL_CAP',
};

export async function POST(req: NextRequest) {
  try {
    const { branchId } = await req.json();

    if (!branchId || !BRANCH_CAMERA_MAP[branchId]) {
      return NextResponse.json({ error: 'Invalid or missing branch ID' }, { status: 400 });
    }

    const envVarName = BRANCH_CAMERA_MAP[branchId];
    const cameraUrl = process.env[envVarName];

    if (!cameraUrl) {
      return NextResponse.json({ error: `Camera URL not configured for branch: ${branchId}` }, { status: 500 });
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
