"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

// ============================================================
// TIPOS
// ============================================================
interface Detection {
  label: string;
  box: [number, number, number, number]; // [x1, y1, x2, y2] normalizados a 0-1000
  track_id?: number;
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
  externalDetections?: Detection[]; // Detecciones externas (WebSocket)
  rotation?: -90 | 0;               // Rotación CSS para cámaras físicamente rotadas
  reconnectKey?: number;            // Incrementar para forzar reconexión WebRTC
}


// ============================================================
// PALETA DE COLORES POR TIPO (canonical labels)
// Formato: [stroke RGB, fill RGB opacity]
// ============================================================
const LABEL_PALETTE: Record<string, { rgb: string; emoji: string }> = {
  barber:         { rgb: "34, 197, 94",   emoji: "✂️" },   // Emerald
  client:         { rgb: "59, 130, 246",  emoji: "💺" },   // Blue
  child_client:   { rgb: "251, 146, 60",  emoji: "🧒" },   // Orange
  waiting_area:   { rgb: "148, 163, 184", emoji: "🛋️" },   // Slate
  waiting_client: { rgb: "168, 85, 247",  emoji: "⏳" },   // Purple
  chair_empty:    { rgb: "148, 163, 184", emoji: "🪑" },   // Slate
  chair_occupied: { rgb: "245, 158, 11",  emoji: "🪑" },   // Amber
  mirror:         { rgb: "147, 197, 253", emoji: "🪞" },   // Sky
  phone:          { rgb: "234, 179, 8",   emoji: "📱" },   // Gold
  bag:            { rgb: "148, 163, 184", emoji: "👜" },   // Slate
  scissors:       { rgb: "147, 197, 253", emoji: "✂️" },   // Sky
  trimmer:        { rgb: "147, 197, 253", emoji: "🪮" },   // Sky
  cigarette:      { rgb: "239, 68, 68",   emoji: "🚬" },   // Red (Alerta)
  vape:           { rgb: "239, 68, 68",   emoji: "💨" },   // Red (Alerta)
  laptop:         { rgb: "96, 165, 250",  emoji: "💻" },   // Blue
  ring_light:     { rgb: "255, 255, 255", emoji: "🔆" },   // White
  kid_vehicle:    { rgb: "244, 63, 94",   emoji: "🏎️" },   // Rose
  person:         { rgb: "255, 255, 255", emoji: "👤" },   // White
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
/** Genera un ID de tracking basado en track_id de la IA o grid aproximado como fallback */
function trackingId(label: string, box: [number, number, number, number], track_id?: number): string {
  if (track_id !== undefined && track_id !== -1) {
    return `tr_${track_id}`;
  }
  const gx = Math.round(box[0] / 80);
  const gy = Math.round(box[1] / 80);
  return `${label}_${gx}_${gy}`;
}


// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function LiveVisionCamera({ cameraName, className, externalDetections, rotation, reconnectKey }: LiveVisionCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackedRef = useRef<Map<string, TrackedDetection>>(new Map());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
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
  // WebRTC — Conexión directa con go2rtc via SDP signaling
  // ============================================================
  const startWebRTC = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    // Cerrar conexión anterior si existe
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setIsStreaming(false);
    setStreamError(null);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // Solicitar pista de video (y audio opcional)
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      // Cuando llegue el stream de video, conectarlo al elemento <video>
      pc.ontrack = (event) => {
        if (event.track.kind === "video" && video) {
          // Usar MediaStream del primer video track
          if (!video.srcObject) {
            video.srcObject = event.streams[0] ?? new MediaStream([event.track]);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          setIsStreaming(true);
          setStreamError(null);
        } else if (state === "failed" || state === "disconnected") {
          setIsStreaming(false);
          // Auto-reconectar tras 3s si falló
          if (state === "failed") {
            setStreamError("Reconectando...");
            setTimeout(startWebRTC, 3000);
          }
        }
      };

      // Crear oferta SDP
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Esperar que ICE gathering termine (o timeout de 2s)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") { resolve(); return; }
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
        setTimeout(resolve, 2000); // timeout fallback
      });

      // Enviar oferta SDP a go2rtc via nuestro proxy (que añade CF headers)
      const res = await fetch(`/api/vision/webrtc?camera=${cameraName}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp,
      });

      if (!res.ok) {
        throw new Error(`Signaling error: ${res.status} ${res.statusText}`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    } catch (err: any) {
      console.error(`[LiveVisionCamera] WebRTC error [${cameraName}]:`, err);
      setStreamError(err.message || "Error de conexión");
      setIsStreaming(false);
      // Reintentar tras 5s
      setTimeout(startWebRTC, 5000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraName]);

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
    const LERP_SPEED   = 0.20;
    const FADE_DELAY   = 2000;
    const FADE_TOTAL   = 300;
    const APPEAR_TIME  = 150;

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

        if (bornAge < APPEAR_TIME) {
          opacity *= bornAge / APPEAR_TIME;
        }
        if (age > FADE_DELAY) {
          opacity *= Math.max(0, 1 - (age - FADE_DELAY) / FADE_TOTAL);
        }
        if (opacity < 0.02) continue;

        // --- COLORES ---
        const palette = LABEL_PALETTE[tracked.label] ?? DEFAULT_PALETTE;
        const rgb = palette.rgb;

        ctx.shadowColor  = `rgba(${rgb}, ${opacity * 0.6})`;
        ctx.shadowBlur   = 8;

        ctx.fillStyle   = `rgba(${rgb}, ${opacity * 0.12})`;
        ctx.beginPath();
        ctx.roundRect(rx1, ry1, w, h, 5);
        ctx.fill();

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

        ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.75})`;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 4);
        ctx.fill();

        ctx.strokeStyle = `rgba(${rgb}, ${opacity * 0.6})`;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 4);
        ctx.stroke();

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

        data.detections.forEach((det: any) => {
          const id = trackingId(det.label, det.box, det.track_id);
          seen.add(id);

          const existing = trackedRef.current.get(id);
          if (existing) {
            existing.targetBox  = det.box;
            existing.label      = det.label; // Actualizar label si cambió por lógica espacial
            existing.lastSeen   = now;
          } else {
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

    // Iniciar WebRTC al montar
    startWebRTC();

    return () => {
      cancelAnimationFrame(animationId);
      eventSource.close();
      resizeObserver.disconnect();
      // Cerrar conexión WebRTC al desmontar
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraName, startWebRTC]);

  // =====================================================
  // RECONEXIÓN FORZADA — cuando reconnectKey incrementa
  // =====================================================
  const prevReconnectKeyRef = useRef(reconnectKey ?? 0);
  useEffect(() => {
    if (reconnectKey !== undefined && reconnectKey !== prevReconnectKeyRef.current) {
      prevReconnectKeyRef.current = reconnectKey;
      startWebRTC();
    }
  }, [reconnectKey, startWebRTC]);

  // =====================================================
  // ACTUALIZACIÓN DE DETECCIONES EXTERNAS
  // =====================================================
  useEffect(() => {
    if (!externalDetections || externalDetections.length === 0) return;

    const now = Date.now();
    externalDetections.forEach((det: any) => {
      const id = trackingId(det.label, det.box, det.track_id);
      const existing = trackedRef.current.get(id);

      if (existing) {
        existing.targetBox = [...det.box] as [number, number, number, number];
        existing.label     = det.label;
        existing.lastSeen  = now;
      } else {
        trackedRef.current.set(id, {
          id,
          label:      det.label,
          displayBox: [...det.box] as [number, number, number, number],
          targetBox:  [...det.box] as [number, number, number, number],
          lastSeen:   now,
          born:       now,
        });
      }
    });
  }, [externalDetections]);

  const isPortrait = rotation === -90;

  return (
    <div className={cn("relative group transition-all duration-500", className)}>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl flex items-center justify-center"
        style={isPortrait ? { aspectRatio: "9/16" } : { minHeight: "300px" }}
      >
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
            {isStreaming ? t("vision.status.live") : streamError ?? t("vision.status.connecting")}
          </span>
        </div>

        {/* ── Contenedor Video WebRTC + Canvas AR ─────────────────────────── */}
        {/* Para cámaras rotadas: el wrapper rota -90° llenando el portrait container */}
        <div
          className="relative flex items-center justify-center"
          style={isPortrait ? {
            position:  "absolute",
            width:     "177.78%",   // 16/9 × 100% — ocupa el ancho extendido
            height:    "56.25%",    // 9/16 × 100% — ocupa la altura comprimida
            top:       "50%",
            left:      "50%",
            transform: "translate(-50%, -50%) rotate(-90deg)",
          } : { width: "100%", height: "100%" }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="max-w-full max-h-[80vh] w-auto h-auto object-contain block mx-auto"
            onLoadedMetadata={() => setIsStreaming(true)}
            onError={(e) => {
              console.error("[LiveVisionCamera] Video element error:", e);
              setStreamError("Error de video");
            }}
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
