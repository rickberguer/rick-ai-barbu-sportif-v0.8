"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

// Tipos para el JSON de Florence-2
interface Detection {
  label: string;
  box: [number, number, number, number]; // [x1, y1, x2, y2] relativos a 1920x1080
}

interface CameraDetectionData {
  detections: Detection[];
  timestamp: number;
}

// Interfaz para el estado interno con persistencia (Smoothing)
interface PersistedDetection extends Detection {
  lastSeen: number;
}

interface LiveVisionCameraProps {
  cameraName: string;
  className?: string;
}

export default function LiveVisionCamera({ cameraName, className }: LiveVisionCameraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const persistedDetectionsRef = useRef<PersistedDetection[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const { t } = useI18n();

  // --- MOTOR AR (SSE + Smoothing) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Sincroniza la resolución interna del canvas
    const currentObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas) {
          canvas.width = entry.contentRect.width;
          canvas.height = entry.contentRect.height;
        }
      }
    });
    currentObserver.observe(canvas);

    // --- MOTOR DE DIBUJO ---
    let animationId: number;
    const drawOverlay = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      
      // Filtrar detecciones viejas (5 segundos de gracia / Memoria prolongada)
      persistedDetectionsRef.current = persistedDetectionsRef.current.filter(
        d => now - d.lastSeen < 5000
      );

      const canvasW = canvas.width;
      const canvasH = canvas.height;

      persistedDetectionsRef.current.forEach((detection) => {
        const [x1, y1, x2, y2] = detection.box;
        
        const rx1 = (x1 / 1000) * canvasW;
        const ry1 = (y1 / 1000) * canvasH;
        const rx2 = (x2 / 1000) * canvasW;
        const ry2 = (y2 / 1000) * canvasH;

        const width = rx2 - rx1;
        const height = ry2 - ry1;

        // --- SISTEMA DE OPACIDAD INTELIGENTE ---
        // Se mantiene al 90% los primeros 2 segundos, luego se desvanece
        const age = now - detection.lastSeen;
        let opacity = 0.9;
        if (age > 2000) {
          opacity = Math.max(0.1, 0.9 * (1 - (age - 2000) / 3000));
        }

        let strokeColor = `rgba(255, 255, 255, ${opacity * 0.8})`;
        let fillColor = `rgba(255, 255, 255, ${opacity * 0.1})`;

        const label = detection.label.toLowerCase();
        let displayLabel = detection.label;

        // --- MAPEO DE TRADUCCIONES ---
        if (label === 'barbero') displayLabel = t('vision.label.barber');
        else if (label === 'cliente') displayLabel = t('vision.label.client');
        else if (label.includes('niño') || label.includes('auto')) displayLabel = t('vision.label.child_car');
        else if (label.includes('fumador')) displayLabel = t('vision.label.smoker');
        else if (label.includes('vacía')) displayLabel = t('vision.label.chair_empty');
        else if (label.includes('ocupada')) displayLabel = t('vision.label.chair_occupied');
        else if (label.includes('espera')) displayLabel = t('vision.label.waiting');
        else if (label.includes('premium')) displayLabel = t('vision.label.premium_towel');
        
        if (label === 'barbero') {
          strokeColor = `rgba(34, 197, 94, ${opacity * 0.9})`; 
          fillColor = `rgba(34, 197, 94, ${opacity * 0.15})`;
        } else if (label === 'cliente') {
          strokeColor = `rgba(59, 130, 246, ${opacity * 0.9})`;
          fillColor = `rgba(59, 130, 246, ${opacity * 0.15})`;
        } else if (label.includes('espera')) {
          strokeColor = `rgba(168, 85, 247, ${opacity * 0.9})`; // Morado para espera
          fillColor = `rgba(168, 85, 247, ${opacity * 0.15})`;
        } else if (label.includes('premium')) {
          strokeColor = `rgba(234, 179, 8, ${opacity * 0.9})`;  // Dorado para Premium
          fillColor = `rgba(234, 179, 8, ${opacity * 0.25})`;
        } else if (label.includes('silla')) {
          strokeColor = `rgba(239, 68, 68, ${opacity * 0.9})`;
          fillColor = `rgba(239, 68, 68, ${opacity * 0.15})`;
          if (label.includes('vacía')) {
            strokeColor = `rgba(255, 255, 255, ${opacity * 0.8})`; 
            fillColor = `rgba(255, 255, 255, ${opacity * 0.1})`;
          }
        } else if (label.includes('fumador')) {
          strokeColor = `rgba(255, 10, 10, ${opacity * 1})`; 
          fillColor = `rgba(255, 0, 0, ${opacity * 0.3})`;
        }

        // --- GLASSMORPHISM BOX ---
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fillColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.roundRect(rx1, ry1, width, height, 4);
        ctx.fill();
        ctx.stroke();

        // Label con Backdrop
        ctx.fillStyle = strokeColor;
        ctx.font = `bold ${Math.max(10, 12 * (canvasW / 1000))}px Inter, system-ui`;
        ctx.fillText(displayLabel, rx1 + 5, ry1 - 5);
      });

      animationId = requestAnimationFrame(drawOverlay);
    };
    drawOverlay();

    // --- CONEXIÓN SSE (Server-Sent Events) ---
    const eventSource = new EventSource(`/api/vision/stream?camera=${cameraName}`);

    eventSource.onopen = () => setIsStreaming(true);
    
    eventSource.onmessage = (event) => {
      try {
        const data: CameraDetectionData = JSON.parse(event.data);
        if (data && data.detections) {
          const now = Date.now();
          
          // Actualizar registros existentes o añadir nuevos
          data.detections.forEach(newDet => {
            const existingIdx = persistedDetectionsRef.current.findIndex(d => 
              Math.abs(d.box[0] - newDet.box[0]) < 50 && d.label === newDet.label
            );

            if (existingIdx !== -1) {
              persistedDetectionsRef.current[existingIdx] = { ...newDet, lastSeen: now };
            } else {
              persistedDetectionsRef.current.push({ ...newDet, lastSeen: now });
            }
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    eventSource.onerror = () => {
      setIsStreaming(false);
    };

    // --- CLEANUP ---
    return () => {
      cancelAnimationFrame(animationId);
      eventSource.close();
      currentObserver.disconnect();
    };
  }, [cameraName, t]);

  return (
    <div className={cn("relative group transition-all duration-500", className)}>
      {/* Contenedor con Aspect Ratio 16:9 Estricto */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
        {/* Indicador de Status Tiempo Real */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          <div className={cn("size-2 rounded-full animate-pulse", isStreaming ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-yellow-500")} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
            {isStreaming ? "Live SSE" : "Connecting..."}
          </span>
        </div>

        {/* Video Stream (RTC o MJPEG) */}
        <iframe
          src={`https://vision.barbusportif.ca/stream.html?src=${cameraName}&mode=webrtc`}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen"
        />

        {/* Capa AR (Canvas para Bounding Boxes) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full pointer-events-none z-10"
        />
      </div>
    </div>
  );
}
