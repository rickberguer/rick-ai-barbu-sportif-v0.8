const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const COMFYUI_BASE_URL = "https://cloud.comfy.org";
const COMFYUI_API_KEY = process.env.COMFYUI_CLOUD_API_KEY;

async function run() {
  console.log("COMFYUI_BASE_URL:", COMFYUI_BASE_URL);
  console.log("COMFYUI_API_KEY Available:", !!COMFYUI_API_KEY);

  if (!COMFYUI_API_KEY) {
    console.error("No API key found in .env.local");
    return;
  }

  try {
    console.log("\n1. Testing base URL...");
    const res = await fetch(COMFYUI_BASE_URL);
    console.log("Base URL Status:", res.status);

    console.log("\n2. Testing /api/prompt fallback or similar endpoints...");
    // Let's test reaching out to some endpoints to see if they exist or return 401 vs 404
    // Usually local comfy uses GET /history, GET /queue
    // If comfy cloud uses same endpoints they should respond or give 401 if unauthorized
    
    const endpoints = [
      "/api/prompt",
      "/api/history",
      "/api/history_v2",
      "/api/view",
      "/api/upload/image"
    ];

    for (const ep of endpoints) {
      try {
        const url = `${COMFYUI_BASE_URL}${ep}`;
        const resEp = await fetch(url, {
          method: 'GET', // testing with GET first
          headers: {
            "X-API-Key": COMFYUI_API_KEY
          }
        });
        console.log(`GET ${ep} -> Status: ${resEp.status}`);
      } catch (e) {
        console.error(`Error testing ${ep}:`, e.message);
      }
    }

  } catch (err) {
    console.error("Connectivity Test Failed:", err);
  }
}

run();
