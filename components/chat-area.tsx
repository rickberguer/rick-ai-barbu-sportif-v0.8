"use client"

import { useState, useEffect, useRef, useCallback, Fragment } from "react"
import { Sparkles, FileText, Music, Copy, Check, Volume2, VolumeX, ChevronDown, ChevronUp, Download, RotateCcw } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThinkingOrb } from "@/components/thinking-orb"
import { useI18n } from "@/lib/i18n"
import { MermaidChart } from "@/components/mermaid-chart"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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
  status?: string
  isStreaming?: boolean
}

interface ChatAreaProps {
  messages: ChatMessage[]
  isLoading?: boolean
  onRegenerate?: (messageId: string) => void
}

export function ChatArea({ messages, isLoading, onRegenerate }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isLoading])

  if (messages.length === 0) return null

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {message.isStreaming && isLoading && (!message.content && (!message.attachments || message.attachments.length === 0)) && (
              <div className="py-2 animate-[messageInAI_0.42s_cubic-bezier(0.16,1,0.3,1)_both]">
                <ThinkingOrb customStatus={message.status} />
              </div>
            )}

            {!(message.role === "assistant" && message.isStreaming && !message.content && (!message.attachments || message.attachments.length === 0)) && (
              <div
                id={`msg-${message.id}`}
                className={message.role === "user"
                  ? "animate-[messageInUser_0.42s_cubic-bezier(0.16,1,0.3,1)_both]"
                  : "animate-[messageInAI_0.42s_cubic-bezier(0.16,1,0.3,1)_both]"}
                style={{ animationDelay: `${Math.min(index * 40, 250)}ms` }}
              >
                {message.role === "user" ? (
                  <UserMessage message={message} />
                ) : (
                  <AssistantMessage message={message} onRegenerate={onRegenerate} />
                )}
              </div>
            )}
          </Fragment>
        ))}

        {isLoading && !messages.some(m => m.isStreaming) && (
          <div className="py-2 animate-[messageInAI_0.42s_cubic-bezier(0.16,1,0.3,1)_both]">
            <ThinkingOrb />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

// ── Relative timestamp ────────────────────────────────────────────────────────
function useRelativeTime(ts?: number) {
  const { t } = useI18n()
  const [label, setLabel] = useState("")

  const compute = useCallback(() => {
    if (!ts) return ""
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return t("chat.justNow")
    if (diff < 3600) return t("chat.minutesAgo", { n: String(Math.floor(diff / 60)) })
    if (diff < 86400) return t("chat.hoursAgo", { n: String(Math.floor(diff / 3600)) })
    return new Date(ts).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" })
  }, [ts, t])

  useEffect(() => {
    setLabel(compute())
    const id = setInterval(() => setLabel(compute()), 30_000)
    return () => clearInterval(id)
  }, [compute])

  return label
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all duration-150",
            copied
              ? "bg-emerald-500/15 text-emerald-500"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? t("chat.copied") : t("chat.copy")}</TooltipContent>
    </Tooltip>
  )
}

// ── Listen (TTS) button ───────────────────────────────────────────────────────
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
      .replace(/```mermaid[\s\S]*?```/g, "Grafico visual omitido.")
      .trim()
    if (!cleanText) return

    const lang = document.documentElement.getAttribute("lang") || "fr"
    const langMap: Record<string, string> = { fr: "fr-CA", en: "en-CA", es: "es-MX" }
    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = langMap[lang] || "fr-CA"
    utterance.rate = 1.0
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find(v => v.lang === utterance.lang) ||
      voices.find(v => v.lang.startsWith(lang))
    if (match) utterance.voice = match
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }, [text, speaking])

  useEffect(() => {
    return () => { if (speaking) window.speechSynthesis?.cancel() }
  }, [speaking])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleToggle}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all duration-150",
            speaking
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{speaking ? t("chat.stopListening") : t("chat.listen")}</TooltipContent>
    </Tooltip>
  )
}

// ── Regenerate button ─────────────────────────────────────────────────────────
function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  const { t } = useI18n()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{t("chat.regenerate")}</TooltipContent>
    </Tooltip>
  )
}

// ── Download button ───────────────────────────────────────────────────────────
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

// ── Waveform streaming cursor ─────────────────────────────────────────────────
function WaveformCursor() {
  return (
    <span className="inline-flex items-end gap-[2px] ml-1 mb-0.5 align-middle" aria-hidden>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-[3px] rounded-full bg-primary"
          style={{
            height: "12px",
            animation: "waveform 1s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
            willChange: "transform",
          }}
        />
      ))}
    </span>
  )
}

// ── USER MESSAGE ──────────────────────────────────────────────────────────────
const COLLAPSE_LINES = 4

function UserMessage({ message }: { message: ChatMessage }) {
  const { t } = useI18n()
  const { content, attachments } = message
  const [expanded, setExpanded] = useState(false)
  const [needsCollapse, setNeedsCollapse] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  const relTime = useRelativeTime(message.timestamp)

  useEffect(() => {
    if (textRef.current) {
      const lineHeight = parseFloat(getComputedStyle(textRef.current).lineHeight) || 20
      setNeedsCollapse(textRef.current.scrollHeight > lineHeight * COLLAPSE_LINES + 4)
    }
  }, [content])

  return (
    <div className="group flex flex-col items-end gap-1.5 pl-10 sm:pl-20">
      {/* Attachment previews */}
      {attachments && attachments.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
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
        <div className="glass-bubble-user relative max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3">
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
            style={{ maxHeight: needsCollapse && !expanded ? `${COLLAPSE_LINES * 1.5}em` : "none" }}
          >
            {content}
          </div>
          {needsCollapse && !expanded && (
            <div className="pointer-events-none absolute right-0 bottom-8 left-0 h-6 bg-gradient-to-t from-[var(--user-bubble)] to-transparent" />
          )}
        </div>
      )}

      {/* Actions + relative timestamp */}
      <div className="flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <CopyButton text={content} />
        <span className="text-[10px] text-muted-foreground/60">{relTime}</span>
      </div>
    </div>
  )
}

// ── ASSISTANT MESSAGE ─────────────────────────────────────────────────────────
function AssistantMessage({ message, onRegenerate }: { message: ChatMessage; onRegenerate?: (id: string) => void }) {
  const { content, attachments, isStreaming } = message
  const relTime = useRelativeTime(message.timestamp)

  const renderContent = (text: string) => {
    const blocks: { type: "text" | "mermaid" | "iframe"; content: string }[] = []
    const combinedRegex = /(```mermaid\s*[\s\S]*?```)|(<iframe[\s\S]*?<\/iframe>)/g
    let lastIndex = 0
    let match

    while ((match = combinedRegex.exec(text)) !== null) {
      if (match.index > lastIndex) blocks.push({ type: "text", content: text.slice(lastIndex, match.index) })
      if (match[1]) blocks.push({ type: "mermaid", content: match[1].replace(/```mermaid|```/g, "").trim() })
      else if (match[2]) blocks.push({ type: "iframe", content: match[2].trim() })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) blocks.push({ type: "text", content: text.slice(lastIndex) })

    return blocks.map((block, blockIndex) => {
      if (block.type === "mermaid") return <MermaidChart key={`m-${blockIndex}`} chart={block.content} />
      if (block.type === "iframe") {
        return (
          <div key={`i-${blockIndex}`} className="my-4 w-full h-[650px] overflow-hidden rounded-xl border border-border/50 bg-muted resize-y">
            <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: block.content }} />
          </div>
        )
      }
      return (
        <div key={`t-${blockIndex}`}>
          {block.content.split("\n").map((paragraph, i) => {
            if (paragraph.startsWith("##")) return <h2 key={i} className="mb-2 mt-4 text-base font-semibold text-foreground">{paragraph.replace(/^#+\s*/, "")}</h2>
            if (paragraph.startsWith("**") && paragraph.endsWith("**")) return <p key={i} className="mb-2 font-semibold text-foreground">{paragraph.replace(/\*\*/g, "")}</p>
            if (paragraph.startsWith("- ")) return <li key={i} className="mb-1 ml-4 list-disc text-sm leading-relaxed text-foreground">{formatBoldText(paragraph.substring(2))}</li>
            if (paragraph.trim() === "") return <br key={i} />
            return <p key={i} className="mb-2 text-sm leading-relaxed text-foreground">{formatBoldText(paragraph)}</p>
          })}
        </div>
      )
    })
  }

  return (
    <div className="group flex gap-3 pr-10 sm:pr-20">
      {/* AI avatar */}
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full mt-1"
        style={{ animation: "orbFloat 4s ease-in-out infinite" }}
      >
        <Sparkles className="size-4 text-gemini-star" />
      </div>

      <div className="flex-1 pt-0.5 min-w-0">
        <div className="glass-bubble-ai rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="prose prose-sm max-w-none text-foreground">
            {renderContent(content)}
            {/* Waveform cursor while streaming */}
            {isStreaming && <WaveformCursor />}
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

        {/* Actions + relative timestamp — appear on hover */}
        {!isStreaming && (
          <div className="mt-1.5 flex items-center gap-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <CopyButton text={content} />
            <ListenButton text={content} />
            {onRegenerate && (
              <RegenerateButton onRegenerate={() => onRegenerate(message.id)} />
            )}
            <span className="ml-1 text-[10px] text-muted-foreground/60">{relTime}</span>
          </div>
        )}
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
