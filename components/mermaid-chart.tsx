"use client";

import React, { useEffect, useState } from 'react';
import mermaid from 'mermaid';

// Inicializamos Mermaid silenciando sus errores globales invasivos
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'inherit',
});

export function MermaidChart({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const renderChart = async () => {
      try {
        setHasError(false);
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

        // 1. Forzamos a Mermaid a validar la sintaxis silenciosamente primero
        const isValid = await mermaid.parse(chart);

        if (isValid) {
          // 2. Si es válido, lo dibujamos
          const { svg } = await mermaid.render(id, chart);
          setSvg(svg);
        }
      } catch (error) {
        console.warn("La IA generó sintaxis Mermaid inválida. Silenciando error global.");
        setHasError(true);

        // Limpiamos cualquier error flotante (como la bomba) que Mermaid haya intentado inyectar en el DOM
        const errorBoxes = document.querySelectorAll('[id^="dmermaid-"]');
        errorBoxes.forEach(box => box.remove());
      }
    };

    if (chart) {
      renderChart();
    }
  }, [chart]);

  // Si la IA se equivocó, mostramos un mensaje Glassmorphism elegante en su lugar
  if (hasError) {
    return (
      <div className="my-4 flex w-full flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center backdrop-blur-md">
        <span className="text-sm font-medium text-amber-400">⚠️ Gráfico complejo no renderizado</span>
        <span className="mt-1 text-[10px] text-gray-400">La IA intentó dibujar un gráfico con formato no soportado. Puedes pedirle que te muestre los mismos datos en una tabla.</span>
      </div>
    );
  }

  return (
    <div
      className="my-4 flex w-full justify-center overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-4 backdrop-blur-md"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}