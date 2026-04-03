"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

// ============================================================
// TIPOS
// ============================================================
interface Detection {
  label: string;
  box: [number, number, number, number]; // [x1, y1, x2, y2] normalizados a 0-1000
}

interface CameraDetectionData {
  detections: Detection[];
  timestamp: number;
}

// Detección con suavizado de posición (lerp entre frames)
interface TrackedDetection {
  id: string;              // Clave única: label + grid aproximado
  label: string;           // Canonical key (ej: "barber", "client")
  displayBox: [number, number, number, number]; // Posición interpolada actual
  targetBox: [number, number, number, number];  // Posición objetivo (último frame IA)
  lastSeen: number;        // Timestamp del último frame válido
  born: number;            // Para animación de aparición
}

interface LiveVisionCameraProps {
  cameraName: string;
  className?: string;
}


// ============================================================
// PALETA DE COLORES POR TIPO (canonical labels)
// Formato: [stroke RGB, fill RGB opacity]
// ============================================================
const LABEL_PALETTE: Record<string, { rgb: string; emoji: string }> = {
  barber:         { rgb: "34, 197, 94",   emoji: "✂️" },   // Emerald
  barber_cutting: { rgb: "16, 185, 129",  emoji: "✂️" },   // Teal
  client:         { rgb: "59, 130, 246",  emoji: "💺" },   // Blue
  child_client:   { rgb: "251, 146, 60",  emoji: "🧒" },   // Orange
  child_seat:     { rgb: "148, 163, 184", emoji: "🪑" },   // Slate (Mueble)
  smoker:         { rgb: "239, 68, 68",   emoji: "🚬" },   // Red (alerta)
  waiting_client: { rgb: "168, 85, 247",  emoji: "⏳" },   // Purple
  chair_empty:    { rgb: "148, 163, 184", emoji: "🪑" },   // Slate
  chair_occupied: { rgb: "245, 158, 11",  emoji: "🪑" },   // Amber
  premium_towel:  { rgb: "234, 179, 8",   emoji: "🤍" },   // Gold
  person:         { rgb: "255, 255, 255", emoji: "👤" },   // White (genérico)
};

const DEFAULT_PALETTE = { rgb: "255, 255, 255", emoji: "📍" };


// ============================================================
// UTILIDADES DE INTERPOLACIÓN (Lerp)
// ============================================================
/** Lineal interpolation — para suavizar la posición entre frames */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Genera un ID de tracking basado en label + posición de grid (~100px gross) */
function trackingId(label: string, box: [number, number, number, number]): string {
  const gx = Math.round(box[0] / 80);
  const gy = Math.round(box[1] / 80);
  return `${label}_${gx}_${gy}`;
}


// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function LiveVisionCamera({ cameraName, className }: LiveVisionCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackedRef = useRef<Map<string, TrackedDetection>>(new Map());
  const [isStreaming, setIsStreaming] = useState(false);
  const { t } = useI18n();

  // Función para obtener la etiqueta traducida desde el canonical key
  const getDisplayLabel = (canonical: string): string => {
    const key = `vision.label.${canonical}`;
    const translated = t(key);
    // Si no hay traducción, usar el canonical capitalizado como fallback
    return translated && translated !== key
      ? translated
      : canonical.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  // ============================================================
  // MOTOR AR — SSE + Interpolación + Canvas 60fps
  // ============================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Sincroniza el canvas con el tamaño real del video
    const syncCanvas = () => {
      if (!canvas || !video) return;
      canvas.width  = video.clientWidth;
      canvas.height = video.clientHeight;
    };
    const resizeObserver = new ResizeObserver(syncCanvas);
    resizeObserver.observe(video);

    // =====================================================
    // LOOP DE DIBUJO — rAF 60fps con lerp de posición
    // =====================================================
    const LERP_SPEED   = 0.20;  // Ligeramente más suave para movimiento fluido
    // FADE timing calibrado para el ciclo REAL observado en los logs:
    // • ndp_stations puede llegar a 5s de ciclo total (Cloudflare latency)
    // • FADE_DELAY = 6.5s → las cajas aguantan visibles incluso en el peor caso (5s + 1.5s buffer)
    // • FADE_TOTAL = 1.5s → desaparecen rápido cuando el objeto realmente sale de escena
    const FADE_DELAY   = 6500;  // ms — debe superar el worst-case del ciclo OD (~5s)
    const FADE_TOTAL   = 1500;  // ms hasta desaparecer completamente
    const APPEAR_TIME  = 300;   // ms de animación de aparición

    let animationId: number;

    const drawLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      const canvasW = canvas.width || 1;
      const canvasH = canvas.height || 1;
      const fontSize = Math.max(10, Math.min(14, canvasW * 0.013));

      // Limpiar detecciones muy viejas
      for (const [id, tracked] of trackedRef.current) {
        if (now - tracked.lastSeen > FADE_DELAY + FADE_TOTAL) {
          trackedRef.current.delete(id);
        }
      }

      for (const tracked of trackedRef.current.values()) {
        // --- LERP: interpolar displayBox hacia targetBox ---
        tracked.displayBox = [
          lerp(tracked.displayBox[0], tracked.targetBox[0], LERP_SPEED),
          lerp(tracked.displayBox[1], tracked.targetBox[1], LERP_SPEED),
          lerp(tracked.displayBox[2], tracked.targetBox[2], LERP_SPEED),
          lerp(tracked.displayBox[3], tracked.targetBox[3], LERP_SPEED),
        ];

        const [x1, y1, x2, y2] = tracked.displayBox;
        const rx1 = (x1 / 1000) * canvasW;
        const ry1 = (y1 / 1000) * canvasH;
        const rx2 = (x2 / 1000) * canvasW;
        const ry2 = (y2 / 1000) * canvasH;
        const w   = rx2 - rx1;
        const h   = ry2 - ry1;

        if (w < 2 || h < 2) continue;

        // --- OPACIDAD: aparición + desvanecimiento ---
        const age     = now - tracked.lastSeen;
        const bornAge = now - tracked.born;
        let opacity   = 0.9;

        // Animación de aparición suave
        if (bornAge < APPEAR_TIME) {
          opacity *= bornAge / APPEAR_TIME;
        }
        // Fade-out cuando la IA deja de detectarlo
        if (age > FADE_DELAY) {
          opacity *= Math.max(0, 1 - (age - FADE_DELAY) / FADE_TOTAL);
        }
        if (opacity < 0.02) continue;

        // --- COLORES ---
        const palette = LABEL_PALETTE[tracked.label] ?? DEFAULT_PALETTE;
        const rgb = palette.rgb;

        // Sombra + glow
        ctx.shadowColor  = `rgba(${rgb}, ${opacity * 0.6})`;
        ctx.shadowBlur   = 8;

        // Relleno semitransparente
        ctx.fillStyle   = `rgba(${rgb}, ${opacity * 0.12})`;
        ctx.beginPath();
        ctx.roundRect(rx1, ry1, w, h, 5);
        ctx.fill();

        // Borde
        ctx.strokeStyle  = `rgba(${rgb}, ${opacity * 0.95})`;
        ctx.lineWidth    = 2;
        ctx.lineJoin     = "round";
        ctx.beginPath();
        ctx.roundRect(rx1, ry1, w, h, 5);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // --- ETIQUETA ---
        const displayLabel = `${palette.emoji} ${getDisplayLabel(tracked.label)}`;
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        const textMetrics = ctx.measureText(displayLabel);
        const labelW  = textMetrics.width + 10;
        const labelH  = fontSize + 8;
        const labelY  = ry1 > labelH + 4 ? ry1 - labelH - 2 : ry1 + 2;
        const labelX  = Math.min(rx1, canvasW - labelW - 2);

        // Fondo de la etiqueta
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.75})`;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 4);
        ctx.fill();

        // Borde de la etiqueta (mismo color)
        ctx.strokeStyle = `rgba(${rgb}, ${opacity * 0.6})`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 4);
        ctx.stroke();

        // Texto
        ctx.fillStyle   = `rgba(255, 255, 255, ${opacity})`;
        ctx.textBaseline = "middle";
        ctx.fillText(displayLabel, labelX + 5, labelY + labelH / 2);
      }

      animationId = requestAnimationFrame(drawLoop);
    };
    drawLoop();

    // =====================================================
    // CONEXIÓN SSE — Actualizar posiciones objetivo
    // =====================================================
    const eventSource = new EventSource(`/api/vision/stream?camera=${cameraName}`);
    eventSource.onopen = () => setIsStreaming(true);

    eventSource.onmessage = (event) => {
      try {
        const data: CameraDetectionData = JSON.parse(event.data);
        if (!data?.detections) return;

        const now   = Date.now();
        const seen  = new Set<string>();

        data.detections.forEach((det) => {
          const id = trackingId(det.label, det.box);
          seen.add(id);

          const existing = trackedRef.current.get(id);
          if (existing) {
            // Actualizar targetBox → el lerp lo animará suavemente
            existing.targetBox  = det.box;
            existing.lastSeen   = now;
          } else {
            // Nueva detección: inicializar displayBox == targetBox (sin salto)
            trackedRef.current.set(id, {
              id,
              label:      det.label,
              displayBox: [...det.box] as [number, number, number, number],
              targetBox:  det.box,
              lastSeen:   now,
              born:       now,
            });
          }
        });
      } catch (e) {
        console.error("[LiveVisionCamera] SSE parse error:", e);
      }
    };

    eventSource.onerror = () => setIsStreaming(false);

    return () => {
      cancelAnimationFrame(animationId);
      eventSource.close();
      resizeObserver.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraName]);

  return (
    <div className={cn("relative group transition-all duration-500", className)}>
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl flex items-center justify-center min-h-[300px]">

        {/* ── Badge de estado ── top-right ──────────────────────────────── */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/10">
          <div
            className={cn(
              "size-2 rounded-full animate-pulse",
              isStreaming
                ? "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                : "bg-yellow-500"
            )}
          />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/90">
            {isStreaming ? t("vision.status.live") : t("vision.status.connecting")}
          </span>
        </div>

        {/* ── Leyenda compacta ── bottom-left ─────────────────────────────── */}
        <div className="absolute bottom-2 left-2 z-30 flex flex-col gap-0.5 bg-black/50 backdrop-blur-sm px-2 py-1.5 rounded-lg border border-white/10">
          {Object.entries(LABEL_PALETTE)
            .filter(([key]) => !["chair_empty", "premium_towel"].includes(key))
            .slice(0, 5)
            .map(([key, { rgb, emoji }]) => (
            <div key={key} className="flex items-center gap-1">
              <div
                className="size-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: `rgb(${rgb})` }}
              />
              <span className="text-[8px] text-white/60 font-medium leading-none">
                {emoji} {getDisplayLabel(key)}
              </span>
            </div>
          ))}
        </div>

        {/* ── Contenedor Video + Canvas ─────────────────────────────────── */}
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={videoRef}
            src={`/api/vision/proxy?camera=${cameraName}`}
            autoPlay
            muted
            playsInline
            className="max-w-full max-h-[80vh] w-auto h-auto object-contain block mx-auto"
            onLoadedMetadata={() => setIsStreaming(true)}
            onError={(e) => console.error("[LiveVisionCamera] MP4 Stream Error:", e)}
          />

          {/* Canvas de IA — superpuesto exactamente encima del video */}
          <canvas
            ref={canvasRef}
            className="absolute pointer-events-none z-10"
            style={{
              top:       "50%",
              left:      "50%",
              transform: "translate(-50%, -50%)",
              width:     videoRef.current?.clientWidth  ?? "100%",
              height:    videoRef.current?.clientHeight ?? "100%",
            }}
          />
        </div>
      </div>
    </div>
  );
}
