import time
import requests
import threading
import json
import io
from PIL import Image

# ============================================================
# CONFIGURACIÓN GLOBAL
# ============================================================
GO2RTC_BASE_URL = "https://vision.barbusportif.ca/api/frame.jpeg?src="
CF_HEADERS = {
    "CF-Access-Client-Id": "44a57e31df8f9837b002f10a1cde2468.access",
    "CF-Access-Client-Secret": "588343af9625fb5f7bb44cc0bf83ad2b656a6fc996afd600ffa7e7dccf6f7e8c"
}
AI_API_URL = "http://localhost:8000/analyze"
AI_API_KEY = "barbu_vision_secret_2026_xyz"
DASHBOARD_API_URL = "https://ai.barbusportif.ca/api/vision/latest"
SESSION_URL   = "https://ai.barbusportif.ca/api/vision/session"
DASHBOARD_API_KEY = "contrasena_para_nextjs_2026"

# Etiquetas mapeadas para el frontend
MAPEO_ETIQUETAS = {
    "barber":       "B. Barbu",
    "client":       "Cliente",
    "child":        "Cliente Niño",
    "chair":        "Asiento",
    "person":       "Persona",
    "wheel":        "Detalle",
    "land vehicle": "Estación de Niño",
    "car":          "Estación de Niño",
    "motorcycle":   "Moto de Niño",
}

# ============================================================
# ESTADO DINÁMICO DE HILOS
# ============================================================
# Dict: { cam_name: threading.Event }  — el evento actúa como señal de STOP
active_threads: dict[str, threading.Event] = {}
active_threads_lock = threading.Lock()

# Session HTTP session reutilizable
session = requests.Session()


# ============================================================
# HELPERS
# ============================================================
def fetch_session() -> list[str]:
    """Consulta el dashboard para saber qué cámaras están activas."""
    try:
        resp = session.get(
            SESSION_URL,
            headers={"Authorization": DASHBOARD_API_KEY},
            timeout=5
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("active"):
                return data.get("cameras", [])
    except Exception as e:
        print(f"  ⚠️  Error consultando sesión: {e}", flush=True)
    return []


def optimize_frame(raw_bytes: bytes) -> tuple[bytes, int, int]:
    """
    Redimensiona el frame y lo comprime a JPEG optimizado.
    Resolución aumentada a 1280px para aprovechar los 16GB de VRAM del 5060 Ti.
    """
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    img_w, img_h = img.size

    target_w = 1280  # ↑ de 1024 a 1280 — más detalle, la GPU lo maneja de sobra
    ratio = target_w / float(img_w)
    target_h = int(img_h * ratio)

    img_resized = img.resize((target_w, target_h), Image.LANCZOS)
    buf = io.BytesIO()
    img_resized.save(buf, format="JPEG", quality=90)  # ↑ calidad 85→90
    return buf.getvalue(), target_w, target_h


def process_detections(raw_detections: any, target_w: int, target_h: int) -> list[dict]:
    """Normaliza y mapea las detecciones al formato esperado por el frontend."""
    if isinstance(raw_detections, dict) and "bboxes" in raw_detections:
        bboxes = raw_detections.get("bboxes", [])
        labels = raw_detections.get("labels", [])
        raw_detections = [{"label": l, "box": b} for l, b in zip(labels, bboxes)]

    finales = []
    for det in (raw_detections or []):
        lbl = det.get("label", "").lower()
        box = det.get("box", [])
        if len(box) != 4:
            continue

        x1, y1, x2, y2 = box
        nx1 = int((x1 / target_w) * 1000)
        ny1 = int((y1 / target_h) * 1000)
        nx2 = int((x2 / target_w) * 1000)
        ny2 = int((y2 / target_h) * 1000)

        mapped = "Objeto"
        for k, v in MAPEO_ETIQUETAS.items():
            if k in lbl:
                mapped = v
                break

        finales.append({
            "label":      mapped,
            "box":        [nx1, ny1, nx2, ny2],
            "confidence": 1.0,
        })
    return finales


def push_detections(cam_name: str, detections: list[dict]):
    """Envía las detecciones al endpoint del dashboard de forma no bloqueante."""
    try:
        session.post(
            DASHBOARD_API_URL,
            json={
                "camera":     cam_name,
                "detections": detections,
                "timestamp":  time.time(),
            },
            headers={"Authorization": DASHBOARD_API_KEY},
            timeout=5,
        )
    except Exception as e:
        print(f"  ⚠️  Push error [{cam_name}]: {e}", flush=True)


# ============================================================
# BUCLE DE CÁMARA (ejecutado en un hilo por cámara)
# ============================================================
def bucle_camara(cam_name: str, stop_event: threading.Event):
    """
    Procesa frames de UNA cámara en loop hasta que stop_event sea activado.
    Optimizado para RTX 5060 Ti: resolución 1280px, quality 90, sin sleep forzado.
    """
    print(f"  🟢 [{cam_name}] Hilo iniciado", flush=True)
    prev_detections_hash = None  # Para deduplicación temporal

    while not stop_event.is_set():
        try:
            inicio = time.time()

            # 1. Capturar frame
            resp = session.get(
                f"{GO2RTC_BASE_URL}{cam_name}",
                headers=CF_HEADERS,
                timeout=5
            )
            if resp.status_code != 200:
                time.sleep(0.5)
                continue

            # 2. Optimizar frame para GPU
            frame_bytes, tw, th = optimize_frame(resp.content)

            # 3. Inferencia con Florence-2
            files   = {"file": ("frame.jpg", frame_bytes, "image/jpeg")}
            payload = {"prompt": "<OD>", "threshold": 0.1}
            resp_ia = session.post(
                AI_API_URL,
                headers={"X-API-Key": AI_API_KEY},
                files=files,
                data=payload,
                timeout=10,
            )
            if resp_ia.status_code != 200:
                time.sleep(0.3)
                continue

            data = resp_ia.json()
            while isinstance(data, str):
                data = json.loads(data)

            # 4. Procesar detecciones
            detections = process_detections(data.get("detections", []), tw, th)

            # 5. Deduplicación temporal: evitar writes innecesarios a Firestore
            det_hash = json.dumps(detections, sort_keys=True)
            if det_hash == prev_detections_hash:
                # La escena no cambió — skip push, pero sigue procesando
                duracion = time.time() - inicio
                print(f"  ⏭️  [{cam_name}] Sin cambios | {duracion:.2f}s", flush=True)
                continue

            prev_detections_hash = det_hash

            # 6. Push al dashboard (en hilo separado para no bloquear el loop)
            t_push = threading.Thread(
                target=push_detections,
                args=(cam_name, detections),
                daemon=True
            )
            t_push.start()

            duracion = time.time() - inicio
            print(
                f"  ✨ [{cam_name}] {len(detections)} obj | {duracion:.2f}s",
                flush=True
            )

        except Exception as e:
            print(f"  ❌ [{cam_name}] Error: {e}", flush=True)
            time.sleep(1)

    print(f"  🔴 [{cam_name}] Hilo detenido", flush=True)


# ============================================================
# MOTOR DE CONTROL — Poll de sesión + threading dinámico
# ============================================================
def motor_principal():
    print("🚀 Worker v8 DEMAND-DRIVEN | RTX 5060 Ti | 1280px | Dynamic Threading", flush=True)
    print("⏳ Esperando sesión activa desde el dashboard...\n", flush=True)

    while True:
        # Consultar qué cámaras necesita el dashboard
        cameras_requeridas = set(fetch_session())
        
        with active_threads_lock:
            cameras_activas = set(active_threads.keys())

            # --- Detener hilos de cámaras que ya no se necesitan ---
            for cam in cameras_activas - cameras_requeridas:
                print(f"  ⏹️  Deteniendo hilo para [{cam}]...", flush=True)
                active_threads[cam].set()   # Señal de stop
                del active_threads[cam]

            # --- Iniciar hilos para cámaras nuevas ---
            for cam in cameras_requeridas - cameras_activas:
                stop_event = threading.Event()
                active_threads[cam] = stop_event
                t = threading.Thread(
                    target=bucle_camara,
                    args=(cam, stop_event),
                    daemon=True
                )
                t.start()
                print(f"  ▶️  Iniciando hilo para [{cam}]...", flush=True)

            # Log de estado
            if cameras_requeridas:
                print(
                    f"  📡 Sesión activa: {list(cameras_requeridas)} "
                    f"({len(cameras_requeridas)} GPU thread(s))",
                    flush=True
                )
            else:
                if cameras_activas:  # Acaba de quedar vacío
                    print("  💤 GPU inactivo — esperando nueva sesión...", flush=True)

        # Poll cada 3 segundos para detectar cambios de sesión
        time.sleep(3)


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    motor_principal()