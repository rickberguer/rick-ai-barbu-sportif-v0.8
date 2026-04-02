"use client"

import { useState, useEffect, useRef, useCallback, Fragment } from "react"
import { Sparkles, FileText, Music, ImageIcon, Copy, Check, Volume2, VolumeX, ChevronDown, ChevronUp, Download } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThinkingOrb } from "@/components/thinking-orb"
import { useI18n } from "@/lib/i18n"
import { MermaidChart } from "@/components/mermaid-chart";

export interface ChatAttachment {
  name: string
  mimeType: string
  data: string
  previewUrl?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  attachments?: ChatAttachment[]
  timestamp?: number
  status?: string          // progress message while streaming (e.g. "Analyzing...")
  isStreaming?: boolean     // true while the AI is still generating
}

interface ChatAreaProps {
  messages: ChatMessage[]
  isLoading?: boolean
}

export function ChatArea({ messages, isLoading }: ChatAreaProps) {
  const { t } = useI18n()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change or on mount
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isLoading])

  if (messages.length === 0) {
    return null
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {/* 🚀 MAGIA VISUAL: Si este mensaje de la IA se está escribiendo, mostramos el Orbe justo ARRIBA */}
            {message.isStreaming && isLoading && (!message.content && (!message.attachments || message.attachments.length === 0)) && (
              <div className="py-2 animate-[messageSlideIn_0.35s_ease-out]">
                <ThinkingOrb customStatus={message.status} />
              </div>
            )}
            
            {!(message.role === "assistant" && message.isStreaming && !message.content && (!message.attachments || message.attachments.length === 0)) && (
            <div
              id={`msg-${message.id}`}
              className="animate-[messageSlideIn_0.35s_ease-out]"
              style={{ animationDelay: `${Math.min(index * 50, 300)}ms`, animationFillMode: "both" }}
            >
              {message.role === "user" ? (
                <UserMessage message={message} />
              ) : (
                <AssistantMessage message={message} />
              )}
            </div>
            )}
          </Fragment>
        ))}
        
        {/* Red de seguridad: Mostrar el Orbe al final solo si la petición empezó pero la caja aún no se crea */}
        {isLoading && !messages.some(m => m.isStreaming) && (
          <div className="py-2 animate-[messageSlideIn_0.35s_ease-out]">
            <ThinkingOrb />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

// --- Timestamp helper ---
function formatTimestamp(ts?: number) {
  if (!ts) return ""
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " " + d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" })
}

// --- Copy button ---
function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={copied ? t("chat.copied") : t("chat.copy")}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

// --- Listen (TTS) button ---
function ListenButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [speaking, setSpeaking] = useState(false)

  const handleToggle = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return

    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }

    const cleanText = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/^-\s*/gm, "")
      .replace(/```mermaid[\s\S]*?```/g, "Grafico visual omitido en el audio.") // Evita que el TTS lea el código de la gráfica
      .trim()

    if (!cleanText) return

    const lang = document.documentElement.getAttribute("lang") || "fr"
    const langMap: Record<string, string> = { fr: "fr-CA", en: "en-CA", es: "es-MX" }
    const targetLang = langMap[lang] || "fr-CA"

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = targetLang
    utterance.rate = 1.0

    const voices = window.speechSynthesis.getVoices()
    const match = voices.find(v => v.lang === targetLang) ||
      voices.find(v => v.lang.startsWith(lang)) ||
      voices.find(v => v.lang.startsWith(targetLang.split("-")[0]))
    if (match) utterance.voice = match

    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }, [text, speaking])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speaking) window.speechSynthesis?.cancel()
    }
  }, [speaking])

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={speaking ? t("chat.stopListening") : t("chat.listen")}
    >
      {speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
    </button>
  )
}

// --- Download button for attachments ---
function DownloadButton({ att }: { att: ChatAttachment }) {
  const { t } = useI18n()

  const handleDownload = useCallback(() => {
    const url = att.previewUrl || att.data
    if (!url) return
    const a = document.createElement("a")
    a.href = url.startsWith("data:") || url.startsWith("http") ? url : `data:${att.mimeType};base64,${url}`
    a.download = att.name
    a.click()
  }, [att])

  return (
    <button
      onClick={handleDownload}
      className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
      title={t("chat.downloadFile")}
    >
      <Download className="size-3.5" />
    </button>
  )
}

// --- USER MESSAGE ---
const COLLAPSE_LINES = 4

function UserMessage({ message }: { message: ChatMessage }) {
  const { t } = useI18n()
  const { content, attachments, timestamp } = message
  const [expanded, setExpanded] = useState(false)
  const [needsCollapse, setNeedsCollapse] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (textRef.current) {
      const lineHeight = parseFloat(getComputedStyle(textRef.current).lineHeight) || 20
      const maxHeight = lineHeight * COLLAPSE_LINES
      setNeedsCollapse(textRef.current.scrollHeight > maxHeight + 4)
    }
  }, [content])

  return (
    <div className="group flex flex-col items-end gap-1.5">
      {/* Attachment previews */}
      {attachments && attachments.length > 0 && (
        <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
          {attachments.map((att, i) => {
            if (att.mimeType.startsWith("image/") && att.previewUrl) {
              return (
                <div key={i} className="group relative overflow-hidden rounded-xl border border-border/50">
                  <img src={att.previewUrl} alt={att.name} className="max-h-48 max-w-60 object-cover" crossOrigin="anonymous" />
                  <DownloadButton att={att} />
                </div>
              )
            }
            if (att.mimeType.startsWith("audio/")) {
              return (
                <div key={i} className="glass-bubble-user flex items-center gap-2 rounded-xl px-3 py-2">
                  <Music className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-foreground">{t("chat.audioAttachment")}</span>
                </div>
              )
            }
            return (
              <div key={i} className="glass-bubble-user group relative flex items-center gap-2 rounded-xl px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="max-w-40 truncate text-xs text-foreground">{att.name}</span>
                <DownloadButton att={att} />
              </div>
            )
          })}
        </div>
      )}

      {/* Text bubble */}
      {content && (
        <div className="glass-bubble-user relative max-w-[80%] rounded-2xl px-4 py-3">
          {needsCollapse && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="absolute -top-1 left-2 z-10 flex items-center gap-0.5 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {expanded ? t("chat.collapse") : t("chat.expand")}
            </button>
          )}
          <div
            ref={textRef}
            className="overflow-hidden text-sm leading-relaxed text-foreground transition-all"
            style={{
              maxHeight: needsCollapse && !expanded ? `${COLLAPSE_LINES * 1.5}em` : "none",
            }}
          >
            {content}
          </div>
          {needsCollapse && !expanded && (
            <div className="pointer-events-none absolute right-0 bottom-8 left-0 h-6 bg-gradient-to-t from-[var(--user-bubble)] to-transparent" />
          )}
        </div>
      )}

      {/* Actions + timestamp */}
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] text-muted-foreground/60">{formatTimestamp(timestamp)}</span>
        <div className="hover-actions flex items-center gap-0.5">
          <CopyButton text={content} />
        </div>
      </div>
    </div>
  )
}

// --- ASSISTANT MESSAGE ---
function AssistantMessage({ message }: { message: ChatMessage }) {
  const { t } = useI18n()
  const { content, attachments, timestamp, status, isStreaming } = message

  // 👇 PRE-PROCESADOR DE CONTENIDO MULTIMEDIA (MERMAID + TEXTO)
  const renderContent = (text: string) => {
    const blocks: { type: 'text' | 'mermaid' | 'iframe'; content: string }[] = [];
    // Expresión regular combinada para encontrar bloques de Mermaid o iframes
    const combinedRegex = /(```mermaid\s*[\s\S]*?```)|(<iframe[\s\S]*?<\/iframe>)/g;
    let lastIndex = 0;
    let match;

    // Buscar y separar los bloques de Mermaid e iframes del texto normal
    while ((match = combinedRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      if (match[1]) { // Es un bloque Mermaid
        const mermaidContent = match[1].replace(/```mermaid|```/g, '').trim();
        blocks.push({ type: 'mermaid', content: mermaidContent });
      } else if (match[2]) { // Es un iframe
        blocks.push({ type: 'iframe', content: match[2].trim() });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      blocks.push({ type: 'text', content: text.slice(lastIndex) });
    }

    // Renderizar cada bloque detectado
    return blocks.map((block, blockIndex) => {
      // 1. Si es un gráfico Mermaid, pasárselo al componente
      if (block.type === 'mermaid') {
        return <MermaidChart key={`mermaid-${blockIndex}`} chart={block.content} />;
      }

      // 2. Si es un Iframe, renderizarlo directamente con dangerouslySetInnerHTML
      if (block.type === 'iframe') {
        return (
          <div key={`iframe-${blockIndex}`} className="my-4 w-full h-[650px] overflow-hidden rounded-xl border border-border/50 bg-muted resize-y">
            <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: block.content }} />
          </div>
        );
      }

      // 2. Si es texto, usar tu parser original de líneas
      return (
        <div key={`text-${blockIndex}`}>
          {block.content.split("\n").map((paragraph, i) => {
            if (paragraph.startsWith("##")) {
              return <h2 key={i} className="mb-2 mt-4 text-base font-semibold text-foreground">{paragraph.replace(/^#+\s*/, "")}</h2>
            }
            if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
              return <p key={i} className="mb-2 font-semibold text-foreground">{paragraph.replace(/\*\*/g, "")}</p>
            }
            if (paragraph.startsWith("- ")) {
              return <li key={i} className="mb-1 ml-4 list-disc text-sm leading-relaxed text-foreground">{formatBoldText(paragraph.substring(2))}</li>
            }
            if (paragraph.trim() === "") return <br key={i} />
            return <p key={i} className="mb-2 text-sm leading-relaxed text-foreground">{formatBoldText(paragraph)}</p>
          })}
        </div>
      );
    });
  };

  return (
    <div className="group flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ animation: "orbFloat 4s ease-in-out infinite" }}>
        <Sparkles className="size-4 text-gemini-star" />
      </div>
      <div className="flex-1 pt-0.5">
        <div className="glass-bubble-ai rounded-2xl px-4 py-3">
          <div className="prose prose-sm max-w-none text-foreground">
            {renderContent(content)}
            {/* Streaming cursor */}
            {isStreaming && (
              <span className="inline-block size-2 animate-pulse rounded-full bg-primary align-middle" />
            )}
          </div>
        </div>

        {/* Generated media */}
        {attachments && attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {attachments.map((att, i) => {
              if (att.mimeType.startsWith("image/")) {
                return (
                  <div key={i} className="group relative overflow-hidden rounded-xl border border-border/50">
                    <img src={att.previewUrl || `data:${att.mimeType};base64,${att.data}`} alt={att.name} className="max-h-72 max-w-80 object-cover" crossOrigin="anonymous" />
                    <DownloadButton att={att} />
                  </div>
                )
              }
              if (att.mimeType.startsWith("video/")) {
                return (
                  <div key={i} className="group relative overflow-hidden rounded-xl border border-border/50">
                    <video controls className="max-h-72 max-w-80" src={att.previewUrl || `data:${att.mimeType};base64,${att.data}`} />
                    <DownloadButton att={att} />
                  </div>
                )
              }
              if (att.mimeType.startsWith("audio/")) {
                return (
                  <div key={i} className="group relative flex items-center gap-2 rounded-xl border border-border/50 p-3">
                    <Music className="size-5 shrink-0 text-gemini-star" />
                    <audio controls src={att.previewUrl || `data:${att.mimeType};base64,${att.data}`} className="h-8" />
                    <DownloadButton att={att} />
                  </div>
                )
              }
              return (
                <div key={i} className="group relative flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="text-xs text-foreground">{att.name}</span>
                  <DownloadButton att={att} />
                </div>
              )
            })}
          </div>
        )}

        {/* Actions + timestamp */}
        <div className="mt-1.5 flex items-center gap-1.5 px-1">
          <span className="text-[10px] text-muted-foreground/60">{formatTimestamp(timestamp)}</span>
          <div className="hover-actions flex items-center gap-0.5">
            <CopyButton text={content} />
            <ListenButton text={content} />
          </div>
        </div>
      </div>
    </div>
  )
}

function formatBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    return part
  })
}
