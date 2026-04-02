"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/lib/i18n"

const thinkingSteps = [
  "thinking.analyzing",
  "thinking.searching",
  "thinking.processing",
  "thinking.generating",
  "thinking.refining",
]

export function ThinkingOrb({ customStatus }: { customStatus?: string }) {
  const { t } = useI18n()
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % thinkingSteps.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-start gap-3">
      {/* Orb container */}
      <div className="relative flex size-12 shrink-0 items-center justify-center">
        {/* Outer glow */}
        <div className="absolute inset-0 animate-pulse rounded-full bg-blue-500/20 blur-xl" />
        
        {/* SVG animated ring */}
        <svg
          viewBox="0 0 100 100"
          className="size-12 animate-[spin_4s_linear_infinite]"
          style={{ filter: "drop-shadow(0 0 8px rgba(130, 160, 255, 0.5))" }}
        >
          <defs>
            <linearGradient id="orbGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1">
                <animate attributeName="stop-color" values="#6366f1;#3b82f6;#8b5cf6;#6366f1" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" stopColor="#ec4899">
                <animate attributeName="stop-color" values="#ec4899;#f97316;#a855f7;#ec4899" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#3b82f6">
                <animate attributeName="stop-color" values="#3b82f6;#8b5cf6;#ef4444;#3b82f6" dur="3s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
            <linearGradient id="orbGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f97316">
                <animate attributeName="stop-color" values="#f97316;#ef4444;#3b82f6;#f97316" dur="4s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#a855f7">
                <animate attributeName="stop-color" values="#a855f7;#6366f1;#ec4899;#a855f7" dur="4s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
            <filter id="orbBlur">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
            </filter>
          </defs>
          
          {/* Main bright ring */}
          <circle
            cx="50" cy="50" r="38"
            fill="none"
            stroke="url(#orbGrad1)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="180 60"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 50 50"
              to="360 50 50"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
          
          {/* Secondary inner glow ring */}
          <circle
            cx="50" cy="50" r="34"
            fill="none"
            stroke="url(#orbGrad2)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="100 140"
            filter="url(#orbBlur)"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="360 50 50"
              to="0 50 50"
              dur="5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Third plasma arc */}
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="url(#orbGrad1)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="40 200"
            opacity="0.6"
            filter="url(#orbBlur)"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="180 50 50"
              to="540 50 50"
              dur="7s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      </div>

      {/* Status text */}
      <div className="flex min-h-[48px] flex-col justify-center gap-1 pt-1">
        <span
          key={stepIndex}
          className="animate-[fadeInUp_0.4s_ease-out] text-sm font-medium text-foreground"
        >
          {customStatus 
            ? customStatus.startsWith("progress.tool:") 
                ? t("progress.executing", { toolName: customStatus.replace("progress.tool:", "") })
                : t(customStatus)
            : t(thinkingSteps[stepIndex])}
        </span>
        <div className="flex items-center gap-1">
          <span className="size-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-primary" />
          <span className="size-1.5 animate-[pulse_1.5s_ease-in-out_0.3s_infinite] rounded-full bg-primary" />
          <span className="size-1.5 animate-[pulse_1.5s_ease-in-out_0.6s_infinite] rounded-full bg-primary" />
        </div>
      </div>
    </div>
  )
}
