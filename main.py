from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status, Request
from fastapi.security import APIKeyHeader
import uvicorn
from transformers import AutoProcessor, AutoModelForCausalLM
from PIL import Image
import io
import torch
import time

# --- SEGURIDAD ---
API_KEY = "barbu_vision_secret_2026_xyz"
api_key_header = APIKeyHeader(name="X-API-Key")

def verify_api_key(api_key: str = Depends(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Acceso denegado.")
    return api_key

app = FastAPI(title="Florence-2 Nitro API — RTX 5060 Ti")

# Variables globales para el modelo
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
model_id = "microsoft/Florence-2-base"
processor = None
model = None

# Métricas de rendimiento
inference_count = 0
total_inference_time = 0.0

@app.on_event("startup")
async def startup_event():
    global processor, model
    print(f"🚀 Cargando Florence-2 para RTX 5060 Ti (16GB VRAM)...", flush=True)

    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        trust_remote_code=True,
        torch_dtype=torch.float16,            # Mitad de VRAM, 3x más rápido en RTX
        attn_implementation="flash_attention_2"  # Optimización Ampere/Ada/Blackwell
    ).to(DEVICE)

    model.eval()

    # torch.compile — dobla el throughput en inferencia continua en PyTorch 2.0+
    # mode="reduce-overhead" es ideal para loops de inferencia con inputs similares
    try:
        model = torch.compile(model, mode="reduce-overhead")
        print("✅ torch.compile activado — máxima velocidad de inferencia.", flush=True)
    except Exception as e:
        print(f"⚠️  torch.compile no disponible ({e}), usando modo estándar.", flush=True)

    # Pre-calentar el modelo con un frame dummy para compilar los kernels CUDA
    try:
        dummy_img = Image.fromarray(__import__("numpy").zeros((640, 640, 3), dtype="uint8"))
        dummy_inputs = processor(text="<OD>", images=dummy_img, return_tensors="pt")
        dummy_inputs = {
            k: v.to(DEVICE).to(torch.float16) if v.dtype == torch.float32 else v.to(DEVICE)
            for k, v in dummy_inputs.items()
        }
        with torch.no_grad():
            model.generate(
                input_ids=dummy_inputs["input_ids"],
                pixel_values=dummy_inputs["pixel_values"],
                max_new_tokens=32,
                num_beams=1,
                do_sample=False,
            )
        print("🔥 Kernels CUDA pre-calentados. Listo para inferencia de producción.", flush=True)
    except Exception as e:
        print(f"⚠️  Warmup falló ({e}), continuando.", flush=True)

    print(f"✅ Florence-2 Nitro listo en {DEVICE.upper()} | {torch.cuda.get_device_name(0) if DEVICE == 'cuda' else 'CPU'}", flush=True)


# ============================================================
# /analyze — Single image inference
# ============================================================
@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...), api_key: str = Depends(verify_api_key)):
    global inference_count, total_inference_time

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Imagen no válida.")

    try:
        t0 = time.perf_counter()
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        inputs = processor(text="<OD>", images=image, return_tensors="pt")
        inputs = {
            k: v.to(DEVICE).to(torch.float16) if v.dtype == torch.float32 else v.to(DEVICE)
            for k, v in inputs.items()
        }

        with torch.no_grad():
            generated_ids = model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=1024,
                early_stopping=False,
                do_sample=False,
                num_beams=1,   # 1 beam = máxima velocidad para OD
            )

        generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
        parsed_answer = processor.post_process_generation(
            generated_text,
            task="<OD>",
            image_size=(image.width, image.height)
        )

        elapsed = time.perf_counter() - t0
        inference_count += 1
        total_inference_time += elapsed

        return {
            "status":     "success",
            "detections": parsed_answer.get("<OD>", {}),
            "latency_ms": round(elapsed * 1000, 1),
        }

    except Exception as e:
        print(f"Error en /analyze: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# /analyze/batch — Procesa 2 frames en un solo forward pass
# Ventaja clave: amortiza el overhead de tokenización sobre 2 imágenes
# ============================================================
@app.post("/analyze/batch")
async def analyze_batch(
    files: list[UploadFile] = File(...),
    api_key: str = Depends(verify_api_key)
):
    global inference_count, total_inference_time

    if len(files) > 2:
        raise HTTPException(status_code=400, detail="Máximo 2 imágenes por batch.")

    try:
        t0 = time.perf_counter()
        images = []
        for f in files:
            contents = await f.read()
            images.append(Image.open(io.BytesIO(contents)).convert("RGB"))

        prompts = ["<OD>"] * len(images)
        inputs = processor(text=prompts, images=images, return_tensors="pt", padding=True)
        inputs = {
            k: v.to(DEVICE).to(torch.float16) if v.dtype == torch.float32 else v.to(DEVICE)
            for k, v in inputs.items()
        }

        with torch.no_grad():
            generated_ids = model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=1024,
                early_stopping=False,
                do_sample=False,
                num_beams=1,
            )

        results = []
        for i, img in enumerate(images):
            text = processor.batch_decode([generated_ids[i]], skip_special_tokens=False)[0]
            parsed = processor.post_process_generation(
                text, task="<OD>", image_size=(img.width, img.height)
            )
            results.append({"detections": parsed.get("<OD>", {})})

        elapsed = time.perf_counter() - t0
        inference_count += len(images)
        total_inference_time += elapsed

        return {
            "status":     "success",
            "batch_size": len(images),
            "results":    results,
            "latency_ms": round(elapsed * 1000, 1),
        }

    except Exception as e:
        print(f"Error en /analyze/batch: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# /status — Health check + GPU metrics
# ============================================================
@app.get("/status")
async def get_status():
    gpu_info = {}
    if DEVICE == "cuda":
        gpu_info = {
            "gpu_name":          torch.cuda.get_device_name(0),
            "vram_allocated_mb": round(torch.cuda.memory_allocated(0) / 1024**2, 1),
            "vram_reserved_mb":  round(torch.cuda.memory_reserved(0) / 1024**2, 1),
            "vram_total_mb":     round(torch.cuda.get_device_properties(0).total_memory / 1024**2, 1),
        }

    avg_latency = (
        round((total_inference_time / inference_count) * 1000, 1)
        if inference_count > 0 else 0
    )

    return {
        "status":              "ok",
        "model":               model_id,
        "device":              DEVICE,
        "inference_count":     inference_count,
        "avg_latency_ms":      avg_latency,
        "gpu":                 gpu_info,
        "torch_compile":       hasattr(model, "_orig_mod"),  # True si torch.compile fue aplicado
    }


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    # uvloop para máxima performance async en Linux (vast.ai)
    # workers=1 para no compartir VRAM entre procesos
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        loop="uvloop",   # Mucho más rápido que asyncio en I/O concurrente
        workers=1,
    )