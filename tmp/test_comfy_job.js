const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const COMFYUI_BASE_URL = "https://cloud.comfy.org";
const COMFYUI_API_KEY = process.env.COMFYUI_CLOUD_API_KEY;

async function run() {
  if (!COMFYUI_API_KEY) {
    console.error("No API key found in .env.local");
    return;
  }

  // Load workflow template
  const wfPath = path.join(__dirname, '../comfyui-workflows/txt2img_workflow.json');
  if (!fs.existsSync(wfPath)) {
    console.error("Workflow file not found:", wfPath);
    return;
  }

  console.log("Loading Workflow...");
  const workflowData = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));

  // Inyectamos valores básicos
  Object.values(workflowData).forEach((node) => {
    const classType = node.class_type || "";
    const title = (node._meta && node._meta.title) ? node._meta.title.toLowerCase() : "";
    const inputs = node.inputs || {};

    if (classType.includes("TextEncode") || classType.includes("CLIPTextEncode")) {
      if (title.includes("negative")) {
        inputs.text = "ugly, deformed, blurry";
      } else if (title.includes("positive")) {
        inputs.text = "A beautiful scene of a futuristic barbershop in Quebec, cinematic lighting, 8k";
      }
    }
    
    if (classType === "EmptyLatentImage") {
        inputs.width = 1024;
        inputs.height = 1024;
    }
    
    if (classType.includes("Sampler")) {
        inputs.seed = Math.floor(Math.random() * 1000000);
    }
  });

  console.log("Sending Job to ComfyUI Cloud...");
  try {
    const promptRes = await fetch(`${COMFYUI_BASE_URL}/api/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": COMFYUI_API_KEY,
      },
      body: JSON.stringify({ prompt: workflowData }),
    });

    console.log("Prompt Response Status:", promptRes.status);
    const text = await promptRes.text();
    console.log("Response Body:", text);

    if (promptRes.ok) {
       const { prompt_id } = JSON.parse(text);
       console.log("Job ID:", prompt_id);
    }

  } catch (err) {
    console.error("Job Request Failed:", err);
  }
}

run();
