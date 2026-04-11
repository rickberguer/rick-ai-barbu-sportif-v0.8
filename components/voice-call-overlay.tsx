"use client"

/**
 * VoiceCallOverlay — Live Voice powered by Gemini Multimodal Live API (Vertex AI)
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 *   Browser ──[WS + ?access_token]──▶ Vertex AI BidiGenerateContent
 *   (Google APIs support OAuth tokens via ?access_token query param per OAuth 2.0 spec)
 *
 * KEY FIXES (v2)
 *   • All message fields use camelCase — the API uses proto3 JSON which ALWAYS uses
 *     camelCase. snake_case fields are silently ignored → setup never completes.
 *   • AudioContext.resume() is called on user gesture to bypass autoplay policies.
 *   • Gapless PCM playback via a monotonically advancing schedule time.
 *   • "Iniciando…" was caused by the WS closing immediately (setup never acked).
 *
 * VISUAL
 *   Replaced the static sphere with an iridescent Newtonian-fluid metaball blob
 *   rendered on an off-screen canvas (80×80 → scaled up via CSS) that reacts to
 *   mic/AI amplitude in real-time.
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type CallState = "idle" | "connecting" | "listening" | "ai-speaking" | "error"

interface VoiceTokenResponse {
  token: string
  model: string
  wsUrl:  string
}

export interface VoiceCallOverlayProps {
  isOpen: boolean
  onClose: () => void
  firebaseToken: string
  panelContext?: string
}

// ─── Rick system prompt ───────────────────────────────────────────────────────

const VOICE_SYSTEM_PROMPT =
  `Eres Rick, el Director Operativo Virtual (vCOO) de Barbu Sportif (Quebec, Canadá). ` +
  `Voz: ENCELADUS — profunda, cálida, carismática. ` +
  `REGLAS: Respuestas cortas (máx 3 oraciones). Habla como socio de negocios. ` +
  `Mezcla español e inglés naturalmente. Si detectas urgencia, priorízala. ` +
  `Termina siempre con acción concreta o pregunta de seguimiento.`

// ─── Audio utilities ──────────────────────────────────────────────────────────

function float32ToInt16(buf: Float32Array): ArrayBuffer {
  const out = new Int16Array(buf.length)
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

function int16ToFloat32(buf: ArrayBuffer): Float32Array<ArrayBuffer> {
  const int16 = new Int16Array(buf)
  const out   = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 0x8000
  return out as Float32Array<ArrayBuffer>
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin   = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ""
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

// ─── Newtonian Fluid Blob (CSS + SVG Gooey Effect) ──────────────────────────

interface BlobProps {
  amplitude:    number
  aiAmplitude:  number
  callState:    CallState
}

function NewtonianBlob({ amplitude, aiAmplitude, callState }: BlobProps) {
  const isAi      = callState === "ai-speaking"
  const isListen  = callState === "listening"
  const amp       = isAi ? aiAmplitude : amplitude

  const baseScale = 1 + amp * 0.18
  const glowSize  = 20 + amp * 60
  const speedScale = 1 + amp * 5

  // Iridescent violet/blue colors based on state
  const color1 = isAi ? "rgba(139,92,246,1)" : "rgba(59,130,246,1)"
  const color2 = isAi ? "rgba(216,180,254,1)" : "rgba(147,197,253,1)"
  const color3 = isAi ? "rgba(192,132,252,1)" : "rgba(96,165,250,1)"

  return (
    <div
      style={{
        position: "relative",
        width: 220,
        height: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* SVG Goo Filter */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="liquid-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -10"
              result="goo"
            />
            {/* Glossy specular highlight composite */}
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Container with Goo Filter */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: "url(#liquid-goo)",
          transform: `scale(${baseScale})`,
          transition: "transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: callState === "connecting" ? 0.7 : 1,
        }}
        className={cn(callState === "connecting" && "animate-pulse")}
      >
        {/* Core Mass */}
        <div
          style={{
            position: "absolute",
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, ${color2}, ${color1})`,
            boxShadow: `inset -10px -10px 20px rgba(0,0,0,0.3), inset 10px 10px 20px rgba(255,255,255,0.4), 0 0 ${glowSize}px ${color3}`,
            transition: "all 0.4s ease",
          }}
        />

        {/* Orbiting Liquid Droplets that fuse into the core */}
        <div style={{ position: "absolute", inset: 0, animation: `spin ${8 / speedScale}s linear infinite` }}>
          <div
            style={{
              position: "absolute",
              top: 15, left: "50%", marginLeft: -30,
              width: 60, height: 60, borderRadius: "50%",
              background: `linear-gradient(135deg, ${color2}, ${color1})`,
              transform: `scale(${0.8 + amp * 0.5}) translateY(${amp * 15}px)`,
              transition: "transform 100ms ease-out, background 0.4s ease",
            }}
          />
        </div>
        <div style={{ position: "absolute", inset: 0, animation: `spin ${14 / speedScale}s linear infinite reverse` }}>
          <div
            style={{
              position: "absolute",
              bottom: 25, right: 35,
              width: 45, height: 45, borderRadius: "50%",
              background: `linear-gradient(135deg, ${color3}, ${color2})`,
              transform: `scale(${0.9 + amp * 0.6}) translateX(${-amp * 10}px)`,
              transition: "transform 100ms ease-out, background 0.4s ease",
            }}
          />
        </div>
        <div style={{ position: "absolute", inset: 0, animation: `spin ${11 / speedScale}s cubic-bezier(0.4, 0, 0.2, 1) infinite` }}>
          <div
            style={{
              position: "absolute",
              top: 50, left: 20,
              width: 50, height: 50, borderRadius: "50%",
              background: `linear-gradient(135deg, ${color1}, ${color3})`,
              transform: `scale(${0.7 + amp * 0.4}) translateY(${-amp * 12}px)`,
              transition: "transform 100ms ease-out, background 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Center icon overlay (Rendered OUTSIDE the goo to stay crisp) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        {callState === "connecting" ? (
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid rgba(255,255,255,0.8)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite",
            }}
          />
        ) : (
          <Volume2
            style={{
              color: "white",
              width: 30,
              height: 30,
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
              opacity: isAi ? 1 : isListen ? 0.75 : 0.5,
              transition: "opacity 400ms ease",
            }}
          />
        )}
      </div>

      {/* Waveform bars */}
      {callState !== "connecting" && (
        <div
          className="absolute flex items-end gap-[4px]"
          style={{ bottom: -30, height: 26 }}
        >
          {[0.5, 0.8, 1, 0.8, 0.5].map((base, i) => (
            <div
              key={i}
              style={{
                width: 4,
                borderRadius: 2,
                background: isAi
                  ? `rgba(167,139,250,${0.7 + amp * 0.3})`
                  : `rgba(96,165,250,${0.65 + amp * 0.35})`,
                height: `${6 + amp * 20 * base}px`,
                transition: "height 50ms ease-out, background 400ms ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main overlay component ───────────────────────────────────────────────────

export function VoiceCallOverlay({
  isOpen,
  onClose,
  firebaseToken,
  panelContext,
}: VoiceCallOverlayProps) {
  const [callState,   setCallState]   = useState<CallState>("idle")
  const [isMuted,     setIsMuted]     = useState(false)
  const [errorMsg,    setErrorMsg]    = useState("")
  const [amplitude,   setAmplitude]   = useState(0)   // mic amplitude 0-1
  const [aiAmplitude, setAiAmplitude] = useState(0)   // AI playback amplitude 0-1

  // Audio pipeline refs
  const wsRef               = useRef<WebSocket | null>(null)
  const micStreamRef        = useRef<MediaStream | null>(null)
  const micCtxRef           = useRef<AudioContext | null>(null)
  const workletNodeRef      = useRef<AudioWorkletNode | null>(null)
  const analyserRef         = useRef<AnalyserNode | null>(null)
  const playCtxRef          = useRef<AudioContext | null>(null)
  const playScheduleRef     = useRef<number>(0)
  const animFrameRef        = useRef<number>(0)
  const aiAmpTimeoutRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isMutedRef          = useRef(false)
  const callStateRef        = useRef<CallState>("idle")

  // Keep refs in sync with state
  useEffect(() => { isMutedRef.current   = isMuted },   [isMuted])
  useEffect(() => { callStateRef.current = callState }, [callState])

  // ── Mic amplitude animation loop ──────────────────────────────────────────

  const startAmplitudeLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)

    const loop = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      setAmplitude(Math.min(1, Math.sqrt(sum / data.length) * 6))
      animFrameRef.current = requestAnimationFrame(loop)
    }
    animFrameRef.current = requestAnimationFrame(loop)
  }, [])

  // ── Gapless PCM playback ──────────────────────────────────────────────────
  // Vertex AI returns raw Int16 PCM at 24 kHz in Base64.
  // We decode → Float32 → AudioBuffer → schedule with monotonically advancing time.

  const playPcmChunk = useCallback((base64Pcm: string) => {
    const ctx = playCtxRef.current
    if (!ctx) return
    if (ctx.state === "suspended") ctx.resume()

    try {
      const rawBuf  = base64ToArrayBuffer(base64Pcm)
      if (rawBuf.byteLength === 0) return
      const float32 = int16ToFloat32(rawBuf)

      const audioBuf = ctx.createBuffer(1, float32.length, 24000)
      audioBuf.copyToChannel(float32, 0)

      const source = ctx.createBufferSource()
      source.buffer = audioBuf
      source.connect(ctx.destination)

      // Monotonically advancing schedule — guarantees gapless playback
      const now       = ctx.currentTime
      const startAt   = Math.max(now + 0.02, playScheduleRef.current)
      source.start(startAt)
      playScheduleRef.current = startAt + audioBuf.duration

      // AI amplitude for blob animation
      const rms = Math.sqrt(float32.reduce((s, v) => s + v * v, 0) / float32.length)
      setAiAmplitude(Math.min(1, rms * 9))
      clearTimeout(aiAmpTimeoutRef.current)
      aiAmpTimeoutRef.current = setTimeout(
        () => setAiAmplitude(0),
        audioBuf.duration * 1000 + 250
      )
    } catch (e) {
      console.error("[voice] PCM playback error:", e)
    }
  }, [])

  // ── Connect to Vertex AI Multimodal Live API ──────────────────────────────

  const startCall = useCallback(async () => {
    if (callStateRef.current !== "idle") return
    setCallState("connecting")
    setErrorMsg("")

    // 1. Resume / create playback AudioContext on user gesture BEFORE the WS opens
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 })
    }
    playCtxRef.current.resume().catch(() => {/* ignore */})
    playScheduleRef.current = 0

    // 2. Ping backend to initialize WebSocket server (Required for Cloud Run)
    try {
      await fetch("/api/voice/proxy")
    } catch {
      // Ignore
    }

    // 3. Open WebSocket to our local Next.js proxy
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${protocol}//${window.location.host}/api/voice/proxy?token=${encodeURIComponent(firebaseToken)}` +
                  (panelContext ? `&context=${encodeURIComponent(panelContext)}` : "")
    
    console.log("[voice] Connecting to proxy:", wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    // ── WebSocket event handlers ─────────────────────────────────────────

    ws.onopen = async () => {
      console.log("[voice] WS open. Proxy will handle setup injection.")

      // 3. Open microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount:     1,
            sampleRate:       16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl:  true,
          },
        })
        micStreamRef.current = stream

        // Mic AudioContext at 16 kHz
        const micCtx    = new AudioContext({ sampleRate: 16000 })
        micCtxRef.current = micCtx
        micCtx.resume().catch(() => {/* ignore */})

        const source   = micCtx.createMediaStreamSource(stream)
        const analyser = micCtx.createAnalyser()
        analyser.fftSize = 512
        analyserRef.current = analyser
        source.connect(analyser)

        // AudioWorklet — hilo dedicado de audio, sin glitches del main thread
        // El archivo /public/pcm-processor.js acumula 1024 samples (64 ms @ 16 kHz)
        // y los envía al main thread via transferable (zero-copy).
        await micCtx.audioWorklet.addModule("/pcm-processor.js")
        const workletNode = new AudioWorkletNode(micCtx, "pcm-capture-processor")
        workletNodeRef.current = workletNode
        source.connect(workletNode)
        // No conectar a destination: solo captura, no reproducción

        workletNode.port.onmessage = (e: MessageEvent<{ channelData: Float32Array }>) => {
          if (isMutedRef.current) return
          if (wsRef.current?.readyState !== WebSocket.OPEN) return

          const pcm16 = float32ToInt16(e.data.channelData)
          const b64   = arrayBufferToBase64(pcm16)

          // ✓ camelCase: realtimeInput → mediaChunks → mimeType
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: b64 }],
            },
          }))
        }

        setCallState("listening")
        startAmplitudeLoop()
      } catch (e: any) {
        setErrorMsg("Micrófono no disponible: " + e.message)
        setCallState("error")
        ws.close()
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)

        // Setup confirmation
        if (msg.setupComplete) {
          console.log("[voice] Setup complete ✓")
          return
        }

        // Audio response — parse camelCase fields from proto3 JSON
        // serverContent → modelTurn → parts[] → inlineData → { mimeType, data }
        const parts: any[] = msg.serverContent?.modelTurn?.parts ?? []
        for (const part of parts) {
          const audio = part.inlineData?.data
          const mime  = part.inlineData?.mimeType ?? ""
          if (audio && mime.startsWith("audio/")) {
            if (callStateRef.current === "listening") setCallState("ai-speaking")
            playPcmChunk(audio)
          }
        }

        // Turn complete → back to listening
        if (msg.serverContent?.turnComplete) {
          const delay = Math.max(
            300,
            (playScheduleRef.current - (playCtxRef.current?.currentTime ?? 0)) * 1000
          )
          setTimeout(() => {
            if (callStateRef.current === "ai-speaking") setCallState("listening")
          }, delay)
        }
      } catch {
        // Non-JSON frame — ignore (binary heartbeat etc.)
      }
    }

    ws.onerror = (ev) => {
      console.error("[voice] WS error", ev)
      setErrorMsg("Error de conexión con Vertex AI. Verifica que el modelo Live esté disponible.")
      setCallState("error")
    }

    ws.onclose = (ev) => {
      console.warn("[voice] WS closed", ev.code, ev.reason)
      if (callStateRef.current !== "idle" && callStateRef.current !== "error") {
        // Unexpected close
        if (ev.code === 1008 || ev.code === 403) {
          setErrorMsg("Token inválido o permisos insuficientes (código " + ev.code + ").")
          setCallState("error")
        } else {
          setCallState("idle")
        }
      }
    }
  }, [firebaseToken, panelContext, startAmplitudeLoop, playPcmChunk])

  // ── End call / cleanup ────────────────────────────────────────────────────

  const endCall = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    clearTimeout(aiAmpTimeoutRef.current)

    wsRef.current?.close()
    wsRef.current = null

    workletNodeRef.current?.port.postMessage({ cmd: "stop" })
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null
    analyserRef.current?.disconnect()
    analyserRef.current = null

    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null

    micCtxRef.current?.close()
    micCtxRef.current = null

    playCtxRef.current?.close()
    playCtxRef.current = null
    playScheduleRef.current = 0

    setAmplitude(0)
    setAiAmplitude(0)
    setCallState("idle")
    setIsMuted(false)
    onClose()
  }, [onClose])

  // Cleanup on unmount
  useEffect(() => () => { endCall() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start / auto-stop when overlay opens/closes
  useEffect(() => {
    if (isOpen  && callStateRef.current === "idle")  startCall()
    if (!isOpen && callStateRef.current !== "idle")  endCall()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  // ── Labels ────────────────────────────────────────────────────────────────

  const stateLabel: Record<CallState, string> = {
    idle:          "Iniciando...",
    connecting:    "Conectando con Rick...",
    listening:     "Escuchando...",
    "ai-speaking": "Rick está hablando...",
    error:         "Error de conexión",
  }

  const isAi     = callState === "ai-speaking"
  const isListen = callState === "listening"
  const userAmp  = isMuted ? 0 : amplitude

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.84)", backdropFilter: "blur(28px)" }}
    >
      {/* ── Fluid blob ─────────────────────────────────────────────────── */}
      <div className="mb-12 mt-2">
        <NewtonianBlob
          amplitude={userAmp}
          aiAmplitude={aiAmplitude}
          callState={callState}
        />
      </div>

      {/* ── State label ─────────────────────────────────────────────────── */}
      <p
        className="text-white/80 text-sm font-medium tracking-widest uppercase mb-1 mt-2"
        style={{ letterSpacing: "0.1em" }}
      >
        {stateLabel[callState]}
      </p>

      {callState === "error" && (
        <p className="text-red-400/80 text-xs mb-3 px-10 text-center max-w-xs">
          {errorMsg}
        </p>
      )}

      <p className="text-white/30 text-xs mb-10 h-4">
        {isListen && !isMuted && "Di algo para hablar con Rick"}
        {isListen && isMuted  && "Micrófono silenciado"}
        {isAi                 && "Rick está respondiendo…"}
      </p>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6">
        {/* Mute */}
        {(isListen || isAi) && (
          <button
            onClick={() => setIsMuted((m) => !m)}
            className={cn(
              "flex size-14 items-center justify-center rounded-full transition-all active:scale-95",
              isMuted
                ? "bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-400/40"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
            aria-label={isMuted ? "Activar micrófono" : "Silenciar"}
          >
            {isMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </button>
        )}

        {/* End call */}
        <button
          onClick={endCall}
          className="flex size-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-all hover:bg-red-600 active:scale-95"
          aria-label="Finalizar llamada"
        >
          <PhoneOff className="size-7" />
        </button>

        {/* Retry */}
        {callState === "error" && (
          <button
            onClick={() => { setCallState("idle"); setTimeout(startCall, 50) }}
            className="flex size-14 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-all active:scale-95"
            aria-label="Reintentar"
          >
            <Phone className="size-6" />
          </button>
        )}
      </div>

      {/* ── Wake word hint ───────────────────────────────────────────────── */}
      <p className="absolute bottom-6 text-white/20 text-[11px] tracking-widest uppercase">
        Di &quot;Rick, Rick&quot; para activar sin tocar la pantalla
      </p>

      {/* ── Keyframes ───────────────────────────────────────────────────── */}
      <style>{`
        @keyframes blobPulse {
          0%, 100% { opacity: 0.65; transform: scale(1); }
          50%       { opacity: 0.9;  transform: scale(1.04); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ─── Compact phone button (used in ChatInputBar) ──────────────────────────────

interface LiveVoiceButtonProps {
  onClick:   () => void
  isActive?: boolean
}

export function LiveVoiceButton({ onClick, isActive }: LiveVoiceButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Llamada de voz en vivo"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
        isActive
          ? "bg-red-500/20 text-red-400 ring-1 ring-red-400/40 hover:bg-red-500/30"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
    >
      <Phone className="size-4" />
      {isActive && (
        <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-red-500 animate-pulse" />
      )}
    </button>
  )
}
