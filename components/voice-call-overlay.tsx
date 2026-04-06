"use client"

/**
 * VoiceCallOverlay
 * ─────────────────
 * Full-screen voice call UI powered by Gemini Live API (Vertex AI).
 * - Connects via WebSocket directly to Vertex AI BidiGenerateContent endpoint
 * - Fetches a short-lived ADC token from /api/voice/token
 * - Captures mic audio at 16 kHz PCM → streams to Gemini
 * - Receives 24 kHz PCM audio from Gemini → plays back instantly
 * - Animated sphere reacts to voice amplitude (user = blue, AI = violet)
 * - Wake word: "rick rick" → auto-opens the call
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type CallState = "idle" | "connecting" | "listening" | "ai-speaking" | "error"

interface VoiceTokenResponse {
  token: string
  model: string
  wsUrl: string
}

interface VoiceCallOverlayProps {
  isOpen: boolean
  onClose: () => void
  /** Firebase ID token to authenticate /api/voice/token */
  firebaseToken: string
  /** Optional: current panel for context injection */
  panelContext?: string
}

// ─── Rick system prompt (voice-optimised, shorter than chat version) ───────────

const VOICE_SYSTEM_PROMPT = `Eres Rick, el Director Operativo Virtual (vCOO) de la cadena de barberías Barbu Sportif (Quebec, Canadá). Tu voz es ENCELADUS — profunda, cálida, carismática. Eres audaz, gracioso, amable y ultra-eficiente.

REGLAS DE VOZ:
- Respuestas cortas y directas. Máximo 3 oraciones por turno (esto es una llamada de voz).
- Habla como un socio de negocios de confianza, no como un asistente genérico.
- Si el usuario te pide datos (ventas, inventario, citas), di que los datos en tiempo real están en el chat de texto.
- Confirma acciones importantes antes de ejecutarlas.
- Mezcla español e inglés naturalmente (el dueño es bilingüe Quebec).
- Si detectas urgencia (problema en sucursal, queja de cliente), prioriza eso.

PERSONALIDAD: Eres el copiloto del negocio. Piensas rápido, hablas con confianza, y siempre terminas con una acción concreta o pregunta de seguimiento.`

// ─── Audio utilities ───────────────────────────────────────────────────────────

/** Convert Float32 PCM samples to Int16 ArrayBuffer (little-endian) */
function float32ToInt16(buffer: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return int16.buffer
}

/** Convert ArrayBuffer (Int16 PCM) to Float32 for Web Audio playback */
function int16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const int16 = new Int16Array(buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000
  }
  return float32
}

/** Base64 → ArrayBuffer */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** ArrayBuffer → Base64 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceCallOverlay({
  isOpen,
  onClose,
  firebaseToken,
  panelContext,
}: VoiceCallOverlayProps) {
  const [callState, setCallState] = useState<CallState>("idle")
  const [isMuted, setIsMuted] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [amplitude, setAmplitude] = useState(0)      // 0-1, drives sphere scale
  const [aiAmplitude, setAiAmplitude] = useState(0)  // 0-1, AI speaking sphere

  // Refs — audio pipeline
  const wsRef = useRef<WebSocket | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const playbackScheduleRef = useRef<number>(0)  // next scheduled playback time
  const animFrameRef = useRef<number>(0)
  const isMutedRef = useRef(false)
  const callStateRef = useRef<CallState>("idle")

  // Wake word
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const wakeWordActiveRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { callStateRef.current = callState }, [callState])

  // ── Wake word detection ───────────────────────────────────────────────────

  const startWakeWord = useCallback(() => {
    if (wakeWordActiveRef.current) return
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return

    const recog = new SpeechRecognitionAPI()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = "es-MX"

    recog.onresult = (e: SpeechRecognitionEvent) => {
      if (callStateRef.current !== "idle") return
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .toLowerCase()
      if (transcript.includes("rick rick") || transcript.includes("rick, rick")) {
        recog.stop()
        wakeWordActiveRef.current = false
        startCall()
      }
    }

    recog.onend = () => {
      wakeWordActiveRef.current = false
      // Restart listening if call is still idle
      if (callStateRef.current === "idle") {
        setTimeout(startWakeWord, 500)
      }
    }

    try {
      recog.start()
      recognitionRef.current = recog
      wakeWordActiveRef.current = true
    } catch {
      // Browser may not allow mic before user gesture — silent fail
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Start wake word when overlay mounts (in background even if closed)
  // [TEMPORARILY DISABLED BY USER REQUEST]
  // useEffect(() => {
  //   startWakeWord()
  //   return () => {
  //     recognitionRef.current?.stop()
  //     wakeWordActiveRef.current = false
  //   }
  // }, [startWakeWord])

  // ── Amplitude animation loop ──────────────────────────────────────────────

  const startAmplitudeLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)

    const loop = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const val = (data[i] - 128) / 128
        sum += val * val
      }
      const rms = Math.sqrt(sum / data.length)
      setAmplitude(Math.min(1, rms * 5))
      animFrameRef.current = requestAnimationFrame(loop)
    }
    animFrameRef.current = requestAnimationFrame(loop)
  }, [])

  // ── Play received PCM audio ───────────────────────────────────────────────

  const playPcmChunk = useCallback((base64Pcm: string) => {
    try {
      const ctx = playbackCtxRef.current
      if (!ctx) return

      const rawBuffer = base64ToArrayBuffer(base64Pcm)
      const float32 = int16ToFloat32(rawBuffer)
      const sampleRate = 24000
      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate)
      audioBuffer.copyToChannel(float32, 0)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      const now = ctx.currentTime
      const startTime = Math.max(now, playbackScheduleRef.current)
      source.start(startTime)
      playbackScheduleRef.current = startTime + audioBuffer.duration

      // Drive AI sphere animation from output amplitude
      const amp = Math.min(1, Math.sqrt(
        float32.reduce((s, v) => s + v * v, 0) / float32.length
      ) * 8)
      setAiAmplitude(amp)
      setTimeout(() => setAiAmplitude(0), audioBuffer.duration * 1000 + 200)
    } catch (e) {
      console.error("Playback error:", e)
    }
  }, [])

  // ── Connect to Vertex AI Live API ─────────────────────────────────────────

  const startCall = useCallback(async () => {
    if (callStateRef.current !== "idle") return
    setCallState("connecting")
    setErrorMsg("")

    // 1. Fetch token
    let tokenData: VoiceTokenResponse
    try {
      const res = await fetch("/api/voice/token", {
        headers: { Authorization: `Bearer ${firebaseToken}` },
      })
      const json = await res.json()
      if (!res.ok) {
        const msg = res.status === 401
          ? "Sesión expirada. Recarga la página."
          : res.status === 500
          ? "Live Voice requiere deploy en Cloud Run con ADC activo."
          : `Error ${res.status}: ${json.error ?? "desconocido"}`
        setErrorMsg(msg)
        setCallState("error")
        return
      }
      tokenData = json
    } catch (e: any) {
      setErrorMsg("No se pudo conectar con el servidor.")
      setCallState("error")
      return
    }

    // 2. Open WebSocket to Vertex AI with token in query params
    // Browsers do not support custom headers in WebSocket, so we pass it in the URL
    const wsUrlWithAuth = `${tokenData.wsUrl}?access_token=${tokenData.token}`
    const ws = new WebSocket(wsUrlWithAuth)

    wsRef.current = ws

    ws.onopen = async () => {
      // 3. Send setup message with system prompt + voice config
      const setupMsg = {
        setup: {
          model: tokenData.model,
          system_instruction: {
            parts: [{ text: VOICE_SYSTEM_PROMPT + (panelContext ? `\n\n[Panel actual del usuario: ${panelContext}]` : "") }],
          },
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: "Enceladus" },
              },
            },
          },
        },
      }
      ws.send(JSON.stringify(setupMsg))

      // 4. Open mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        micStreamRef.current = stream

        // Mic AudioContext at 16 kHz
        const ctx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = ctx

        const source = ctx.createMediaStreamSource(stream)

        // Analyser for amplitude visualisation
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyserRef.current = analyser
        source.connect(analyser)

        // ScriptProcessor to capture PCM chunks
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor
        source.connect(processor)
        processor.connect(ctx.destination)

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return
          if (wsRef.current?.readyState !== WebSocket.OPEN) return
          const pcm16 = float32ToInt16(e.inputBuffer.getChannelData(0))
          const b64 = arrayBufferToBase64(pcm16)
          wsRef.current.send(
            JSON.stringify({
              realtime_input: {
                media_chunks: [{ mime_type: "audio/pcm;rate=16000", data: b64 }],
              },
            })
          )
        }

        // Playback AudioContext at 24 kHz
        playbackCtxRef.current = new AudioContext({ sampleRate: 24000 })
        playbackScheduleRef.current = 0

        setCallState("listening")
        startAmplitudeLoop()
      } catch (e: any) {
        setErrorMsg("No se pudo acceder al micrófono: " + e.message)
        setCallState("error")
        ws.close()
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        // setup_complete confirmation
        if (msg.setupComplete) return

        // Audio response from model
        const parts = msg.serverContent?.modelTurn?.parts ?? msg.server_content?.model_turn?.parts ?? []
        for (const part of parts) {
          const audio =
            part.inlineData?.data ?? part.inline_data?.data
          const mime =
            part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? ""
          if (audio && mime.startsWith("audio/")) {
            if (callStateRef.current === "listening") setCallState("ai-speaking")
            playPcmChunk(audio)
          }
        }

        // Turn complete — back to listening
        if (msg.serverContent?.turnComplete || msg.server_content?.turn_complete) {
          setTimeout(() => {
            if (callStateRef.current === "ai-speaking") setCallState("listening")
          }, 300)
        }
      } catch {
        // Non-JSON frame — ignore
      }
    }

    ws.onerror = () => {
      setErrorMsg("Error de conexión con Vertex AI.")
      setCallState("error")
    }

    ws.onclose = () => {
      if (callStateRef.current !== "idle" && callStateRef.current !== "error") {
        setCallState("idle")
      }
    }
  }, [firebaseToken, panelContext, startAmplitudeLoop, playPcmChunk])

  // ── End call / cleanup ────────────────────────────────────────────────────

  const endCall = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)

    wsRef.current?.close()
    wsRef.current = null

    processorRef.current?.disconnect()
    processorRef.current = null

    analyserRef.current?.disconnect()
    analyserRef.current = null

    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null

    audioCtxRef.current?.close()
    audioCtxRef.current = null

    playbackCtxRef.current?.close()
    playbackCtxRef.current = null

    playbackScheduleRef.current = 0
    setAmplitude(0)
    setAiAmplitude(0)
    setCallState("idle")
    setIsMuted(false)
    onClose()
  }, [onClose])

  // Cleanup on unmount
  useEffect(() => () => { endCall() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start when overlay is opened
  useEffect(() => {
    if (isOpen && callStateRef.current === "idle") {
      startCall()
    }
    if (!isOpen && callStateRef.current !== "idle") {
      endCall()
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  // ── Sphere visual parameters ──────────────────────────────────────────────

  const isAiSpeaking = callState === "ai-speaking"
  const userAmp = isMuted ? 0 : amplitude
  const activeAmp = isAiSpeaking ? aiAmplitude : userAmp
  const sphereScale = 1 + activeAmp * 0.35

  const stateLabel: Record<CallState, string> = {
    idle: "Iniciando...",
    connecting: "Conectando con Rick...",
    listening: "Escuchando...",
    "ai-speaking": "Rick está hablando...",
    error: "Error de conexión",
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(24px)" }}
    >
      {/* ── Animated sphere ─────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center mb-10">
        {/* Outer glow rings */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 340,
            height: 340,
            background: isAiSpeaking
              ? "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
            transform: `scale(${sphereScale * 1.4})`,
            transition: "transform 80ms ease-out, background 600ms ease",
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 260,
            height: 260,
            background: isAiSpeaking
              ? "radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 65%)"
              : "radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 65%)",
            transform: `scale(${sphereScale * 1.2})`,
            transition: "transform 60ms ease-out, background 600ms ease",
          }}
        />

        {/* Main sphere */}
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: "50%",
            transform: `scale(${sphereScale})`,
            transition: "transform 50ms ease-out",
            background: isAiSpeaking
              ? `radial-gradient(ellipse at 35% 35%,
                  rgba(216,180,254,0.95) 0%,
                  rgba(139,92,246,0.9) 30%,
                  rgba(79,34,204,0.85) 60%,
                  rgba(30,10,80,0.95) 100%)`
              : callState === "connecting"
              ? `radial-gradient(ellipse at 35% 35%,
                  rgba(148,163,184,0.9) 0%,
                  rgba(71,85,105,0.85) 40%,
                  rgba(15,23,42,0.95) 100%)`
              : `radial-gradient(ellipse at 35% 35%,
                  rgba(147,210,255,0.95) 0%,
                  rgba(59,130,246,0.9) 30%,
                  rgba(29,78,216,0.85) 60%,
                  rgba(10,20,60,0.95) 100%)`,
            boxShadow: isAiSpeaking
              ? `0 0 ${40 + activeAmp * 60}px rgba(139,92,246,${0.5 + activeAmp * 0.4}),
                 0 0 ${80 + activeAmp * 80}px rgba(139,92,246,${0.2 + activeAmp * 0.2}),
                 inset 0 1px 0 rgba(255,255,255,0.3)`
              : callState === "listening"
              ? `0 0 ${30 + userAmp * 50}px rgba(59,130,246,${0.4 + userAmp * 0.5}),
                 0 0 ${60 + userAmp * 60}px rgba(59,130,246,${0.15 + userAmp * 0.2}),
                 inset 0 1px 0 rgba(255,255,255,0.25)`
              : `0 0 40px rgba(71,85,105,0.4),
                 inset 0 1px 0 rgba(255,255,255,0.15)`,
            animation: callState === "connecting"
              ? "voicePulse 1.8s ease-in-out infinite"
              : "none",
          }}
        >
          {/* Inner highlight */}
          <div
            style={{
              position: "absolute",
              top: "14%",
              left: "20%",
              width: "38%",
              height: "28%",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.35)",
              filter: "blur(8px)",
              transform: "rotate(-20deg)",
            }}
          />
          {/* Center icon */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {callState === "connecting" ? (
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "2px solid rgba(255,255,255,0.6)",
                  borderTopColor: "rgba(255,255,255,0.05)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            ) : (
              <Volume2
                style={{
                  color: "rgba(255,255,255,0.85)",
                  width: 32,
                  height: 32,
                  filter: "drop-shadow(0 0 8px rgba(255,255,255,0.4))",
                  opacity: isAiSpeaking ? 1 : 0.7,
                }}
              />
            )}
          </div>
        </div>

        {/* Waveform dots — 5 animated bars */}
        {callState !== "connecting" && (
          <div
            className="absolute bottom-[-28px] flex items-end gap-[5px]"
            style={{ height: 24 }}
          >
            {[0.4, 0.7, 1, 0.7, 0.4].map((base, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: isAiSpeaking
                    ? "rgba(139,92,246,0.85)"
                    : "rgba(59,130,246,0.75)",
                  height: `${8 + activeAmp * 16 * base}px`,
                  transition: "height 50ms ease-out, background 600ms ease",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── State label ─────────────────────────────────────────────────── */}
      <p
        className="text-white/80 text-sm font-medium tracking-wide mb-2 mt-4"
        style={{ letterSpacing: "0.08em" }}
      >
        {stateLabel[callState]}
      </p>

      {callState === "error" && (
        <p className="text-red-400/80 text-xs mb-4 px-8 text-center">{errorMsg}</p>
      )}

      <p className="text-white/30 text-xs mb-10">
        {callState === "listening" && !isMuted
          ? "Di algo para hablar con Rick"
          : callState === "listening" && isMuted
          ? "Micrófono silenciado"
          : callState === "ai-speaking"
          ? "Rick está respondiendo..."
          : ""}
      </p>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6">
        {/* Mute button */}
        {(callState === "listening" || callState === "ai-speaking") && (
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

        {/* Retry on error */}
        {callState === "error" && (
          <button
            onClick={() => { setCallState("idle"); startCall() }}
            className="flex size-14 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-all active:scale-95"
            aria-label="Reintentar"
          >
            <Phone className="size-6" />
          </button>
        )}
      </div>

      {/* ── Wake word hint ───────────────────────────────────────────────── */}
      <p className="absolute bottom-6 text-white/20 text-[11px] tracking-widest uppercase">
        Di &quot;Rick, Rick&quot; para llamar sin tocar la pantalla
      </p>

      {/* ── Inline keyframes ────────────────────────────────────────────── */}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.06); }
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
  onClick: () => void
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
