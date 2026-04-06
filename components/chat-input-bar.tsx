"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Plus,
  ArrowUp,
  Mic,
  AlertTriangle,
  Camera,
  Square,
  X,
  FileText,
  Music,
  Search,
  Video,
  ImageIcon,
  Music2,
  PenTool,
  GraduationCap,
  FolderOpen,
  Zap,
  Sparkles,
  ChevronDown,
  Settings2,
  HelpCircle,
  Keyboard,
  Phone,
} from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ChatAttachment, ChatMessage } from "@/components/chat-area"

export type ToolMode =
  | null
  | "deep-research"
  | "create-videos"
  | "create-images"
  | "create-music"
  | "canvas"
  | "guided-learning"

interface ChatInputBarProps {
  onSendMessage: (message: string, attachments?: ChatAttachment[], tool?: ToolMode) => void
  onStopGeneration?: () => void
  isLoading?: boolean
  activeTool?: ToolMode
  onToolSelect?: (tool: ToolMode) => void
  modelSelected?: "rapido" | "pro"
  onModelChange?: (model: "rapido" | "pro") => void
  thinkingLevel?: "low" | "high"
  onThinkingLevelChange?: (level: "low" | "high") => void
  messages?: ChatMessage[]
  onScrollToMessage?: (messageId: string) => void
  isSimple?: boolean
  chatId?: string | null
  onLiveVoice?: () => void
  isVoiceActive?: boolean
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(messages: ChatMessage[]): number {
  return Math.ceil(messages.reduce((acc, m) => acc + (m.content?.length ?? 0), 0) / 4)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, resolveReject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1])
    }
    reader.onerror = resolveReject
    reader.readAsDataURL(file)
  })
}

export function ChatInputBar({
  onSendMessage,
  onStopGeneration,
  isLoading,
  activeTool,
  onToolSelect,
  modelSelected = "rapido",
  onModelChange,
  thinkingLevel = "low",
  onThinkingLevelChange,
  messages = [],
  onScrollToMessage,
  isSimple = false,
  chatId,
  onLiveVoice,
  isVoiceActive = false,
}: ChatInputBarProps) {
  const { t } = useI18n()
  const [message, setMessage] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Token estimate from conversation
  const tokenCount = estimateTokens(messages)

  // Draft persistence — restore when chatId changes
  useEffect(() => {
    const key = chatId ? `draft_${chatId}` : null
    if (!key) { setMessage(""); return }
    const saved = localStorage.getItem(key)
    setMessage(saved ?? "")
  }, [chatId])

  // Save draft debounced (300 ms)
  useEffect(() => {
    if (!chatId) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      if (message.trim()) {
        localStorage.setItem(`draft_${chatId}`, message)
      } else {
        localStorage.removeItem(`draft_${chatId}`)
      }
    }, 300)
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [message, chatId])

  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])

  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const processFiles = useCallback(async (files: FileList) => {
    const newAttachments: ChatAttachment[] = []
    for (const file of Array.from(files)) {
      const data = await fileToBase64(file)
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined
      newAttachments.push({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data,
        previewUrl,
      })
    }
    setPendingAttachments((prev) => [...prev, ...newAttachments])
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) processFiles(e.target.files)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [processFiles]
  )

  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) processFiles(e.target.files)
      if (cameraInputRef.current) cameraInputRef.current.value = ""
    },
    [processFiles]
  )

  const removeAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => {
      const removed = prev[index]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setRecordingDuration(0)
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(",")[1]
          setPendingAttachments((prev) => [
            ...prev,
            { name: `audio-${Date.now()}.webm`, mimeType: "audio/webm", data: base64 },
          ])
        }
        reader.readAsDataURL(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error("Microphone access denied:", err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const canSend = (message.trim().length > 0 || pendingAttachments.length > 0) && !isLoading

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSend = () => {
    if (!canSend) return
    onSendMessage(message.trim(), pendingAttachments.length > 0 ? pendingAttachments : undefined, activeTool)
    setMessage("")
    setPendingAttachments([])
    if (chatId) localStorage.removeItem(`draft_${chatId}`)
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        const dt = new DataTransfer()
        files.forEach((f) => dt.items.add(f))
        processFiles(dt.files)
      }
    },
    [processFiles]
  )

  return (
    <div className="mx-auto w-full max-w-3xl px-4 md:pb-4 pb-20 pt-2">
      {/* ── Input bubble ─────────────────────────────────────────── */}
      <div className={cn(
        "glass-input flex flex-col rounded-3xl shadow-sm transition-all duration-300",
        "focus-within:shadow-lg focus-within:shadow-primary/10 focus-within:border-primary/20",
        isLoading && "animate-input-pulse"
      )}>
        {/* Loading warning */}
        {isLoading && (
          <div className="flex animate-pulse items-center justify-center gap-2 border-b border-border/50 px-4 py-2.5">
            <AlertTriangle className="size-4 shrink-0 text-amber-500/80" />
            <span className="text-center text-xs text-amber-500/90">
              {t("input.processingWarning")}
            </span>
          </div>
        )}

        {/* Active tool chip */}
        {!isSimple && activeTool && (
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
              <span className="size-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-accent-foreground">
                {activeTool === "deep-research" && t("tools.deepResearch")}
                {activeTool === "create-videos" && t("tools.createVideos")}
                {activeTool === "create-images" && t("tools.createImages")}
                {activeTool === "create-music" && t("tools.createMusic")}
                {activeTool === "canvas" && t("tools.canvas")}
                {activeTool === "guided-learning" && t("tools.guidedLearning")}
              </span>
              <button
                type="button"
                onClick={() => onToolSelect?.(null)}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className="group relative flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 animate-in fade-in zoom-in-95 duration-150"
              >
                {att.mimeType.startsWith("image/") && att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="size-10 rounded-lg object-cover" crossOrigin="anonymous" />
                ) : att.mimeType.startsWith("audio/") ? (
                  <Music className="size-4 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" />
                )}
                <span className="max-w-24 truncate text-xs text-foreground">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="flex size-5 items-center justify-center rounded-full bg-foreground/10 text-foreground/60 transition-colors hover:bg-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea row */}
        <div className="flex items-end gap-2 px-3 pt-3 pb-1">
          {!isSimple && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:scale-110 active:scale-95"
                    aria-label={t("input.attach")}
                  >
                    <Plus className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("input.attach")}</TooltipContent>
              </Tooltip>
              <input ref={fileInputRef} type="file" multiple accept="*/*" onChange={handleFileSelect} className="hidden" />
            </>
          )}

          {!isSimple && (
            <>
              <div className="md:hidden">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:scale-110 active:scale-95"
                      aria-label={t("input.camera")}
                    >
                      <Camera className="size-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("input.camera")}</TooltipContent>
                </Tooltip>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="hidden" />
            </>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t("input.placeholder")}
            className="max-h-[200px] min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
          />
        </div>

        {/* Bottom row — mic · model · send (right-aligned) */}
        <div className="flex items-center justify-end px-3 pb-3 pt-0 gap-1.5">
          {/* Recording state */}
          {!isSimple && isRecording && (
            <div className="flex items-center gap-2 mr-auto">
              <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
                {t("input.recording")} {formatDuration(recordingDuration)}
              </span>
              <button
                onClick={stopRecording}
                className="flex size-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-all hover:bg-destructive/90 hover:scale-105 active:scale-95"
                aria-label={t("input.stopRecording")}
              >
                <Square className="size-3.5" />
              </button>
            </div>
          )}

          {/* Mic */}
          {!isSimple && !isRecording && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={startRecording}
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground hover:scale-110 active:scale-95"
                  aria-label={t("input.voiceInput")}
                >
                  <Mic className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("input.voiceInput")}</TooltipContent>
            </Tooltip>
          )}

          {/* Model selector */}
          {!isSimple && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all hover:scale-105 active:scale-95",
                    modelSelected === "pro"
                      ? "border-primary/40 bg-primary/10 text-primary shadow-sm shadow-primary/20"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  {modelSelected === "pro" ? <Sparkles className="size-3" /> : <Zap className="size-3" />}
                  <span className="hidden sm:inline">
                    {modelSelected === "pro"
                      ? `Pro · ${thinkingLevel === "high" ? t("input.thinkingHigh") : t("input.thinkingLow")}`
                      : t("input.modelFast")}
                  </span>
                  <ChevronDown className="size-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" side="top" sideOffset={8} className="glass w-52 rounded-xl p-1.5 shadow-lg">
                {/* Fast model */}
                <button
                  onClick={() => onModelChange?.("rapido")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    modelSelected === "rapido" ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted"
                  )}
                >
                  <Zap className="size-4 text-muted-foreground" />
                  <div className="flex flex-col items-start">
                    <span>{t("input.modelFast")}</span>
                    <span className="text-[10px] text-muted-foreground">Gemini Flash</span>
                  </div>
                  {modelSelected === "rapido" && <span className="ml-auto size-2 rounded-full bg-primary" />}
                </button>

                {/* Pro model */}
                <button
                  onClick={() => onModelChange?.("pro")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    modelSelected === "pro" ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted"
                  )}
                >
                  <Sparkles className="size-4 text-primary" />
                  <div className="flex flex-col items-start">
                    <span>Pro</span>
                    <span className="text-[10px] text-muted-foreground">Gemini 3.1 Pro</span>
                  </div>
                  {modelSelected === "pro" && <span className="ml-auto size-2 rounded-full bg-primary" />}
                </button>

                {/* Thinking level submenu — only when Pro is selected */}
                {modelSelected === "pro" && (
                  <div className="mt-1 border-t border-border/40 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("input.thinkingLevel")}
                    </p>
                    <button
                      onClick={() => onThinkingLevelChange?.("low")}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        thinkingLevel === "low" ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted"
                      )}
                    >
                      <Zap className="size-3.5 text-amber-400" />
                      <div className="flex flex-col items-start">
                        <span className="text-xs">{t("input.thinkingLow")}</span>
                        <span className="text-[10px] text-muted-foreground">{t("input.thinkingLowDesc")}</span>
                      </div>
                      {thinkingLevel === "low" && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                    </button>
                    <button
                      onClick={() => onThinkingLevelChange?.("high")}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        thinkingLevel === "high" ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted"
                      )}
                    >
                      <Sparkles className="size-3.5 text-violet-400" />
                      <div className="flex flex-col items-start">
                        <span className="text-xs">{t("input.thinkingHigh")}</span>
                        <span className="text-[10px] text-muted-foreground">{t("input.thinkingHighDesc")}</span>
                      </div>
                      {thinkingLevel === "high" && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}

          {/* Live Voice */}
          {!isSimple && onLiveVoice && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onLiveVoice}
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
                    isVoiceActive
                      ? "bg-red-500/20 text-red-400 ring-1 ring-red-400/40 hover:bg-red-500/30"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-label="Llamada de voz en vivo"
                >
                  <Phone className="size-4" />
                  {isVoiceActive && (
                    <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{isVoiceActive ? "Finalizar llamada" : "Llamada de voz con Rick"}</TooltipContent>
            </Tooltip>
          )}

          {/* Send / Stop */}
          {isLoading ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onStopGeneration}
                  className="flex size-9 items-center justify-center rounded-full bg-destructive/20 text-destructive transition-all hover:bg-destructive/30 hover:scale-105 active:scale-95"
                  aria-label={t("input.stop")}
                >
                  <Square className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("input.stop")}</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "flex size-9 items-center justify-center rounded-full transition-all duration-200",
                canSend
                  ? "bg-foreground text-background hover:bg-foreground/90 hover:scale-110 active:scale-95 shadow-sm"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              aria-label={t("input.send")}
            >
              <ArrowUp className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tools + Files strip (below bubble) ───────────────────── */}
      {!isSimple && (
        <div className="mt-2.5 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
          {/* Tools menu */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                "hover:bg-muted hover:border-border hover:scale-105 active:scale-95",
                activeTool
                  ? "border-primary/30 bg-primary/8 text-primary"
                  : "border-border/60 bg-background/40 text-muted-foreground backdrop-blur-sm"
              )}>
                <Settings2 className="size-3.5" />
                <span>{t("input.tools")}</span>
                {activeTool && <span className="size-1.5 rounded-full bg-primary animate-pulse" />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" side="top" sideOffset={8} className="glass w-64 rounded-2xl p-2 shadow-lg">
              <div className="flex flex-col">
                {([
                  { id: "deep-research" as const, icon: Search, label: "tools.deepResearch", disabled: false },
                  { id: "create-videos" as const, icon: Video, label: "tools.createVideos", disabled: true },
                  { id: "create-images" as const, icon: ImageIcon, label: "tools.createImages", disabled: false },
                  { id: "create-music" as const, icon: Music2, label: "tools.createMusic", badge: true, disabled: true },
                  { id: "canvas" as const, icon: PenTool, label: "tools.canvas", disabled: true },
                  { id: "guided-learning" as const, icon: GraduationCap, label: "tools.guidedLearning", disabled: false },
                ] as const).map((tool: any) => (
                  <button
                    key={tool.id}
                    disabled={tool.disabled}
                    onClick={() => !tool.disabled && onToolSelect?.(activeTool === tool.id ? null : tool.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      tool.disabled
                        ? "cursor-not-allowed opacity-40"
                        : activeTool === tool.id
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground hover:bg-muted"
                    )}
                  >
                    <tool.icon className={cn("size-5", tool.disabled ? "text-muted-foreground/50" : "text-muted-foreground")} />
                    <span>{t(tool.label)}</span>
                    {tool.disabled && (
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t("tools.comingSoon")}
                      </span>
                    )}
                    {!tool.disabled && tool.badge && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {t("tools.new")}
                      </span>
                    )}
                    {!tool.disabled && activeTool === tool.id && (
                      <span className="ml-auto size-2 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Chat Files */}
          <ChatFilesButton messages={messages} onScrollToMessage={onScrollToMessage} />

          {/* Token counter */}
          {tokenCount > 0 && (
            <span className="hidden md:inline text-[10px] text-muted-foreground/40 tabular-nums">
              {t("input.tokens", { n: String(tokenCount) })}
            </span>
          )}

          {/* Keyboard shortcuts hint */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-full border border-border/40 bg-background/30 px-2 py-1 text-[10px] text-muted-foreground/60 transition-all hover:bg-muted hover:text-muted-foreground hover:scale-105 active:scale-95 backdrop-blur-sm"
                title={t("kbShortcuts.title")}
              >
                <Keyboard className="size-3" />
                <span className="hidden sm:inline">?</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" sideOffset={8} className="glass w-64 rounded-2xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                <HelpCircle className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">{t("kbShortcuts.title")}</span>
              </div>
              <div className="flex flex-col gap-2">
                {([
                  { key: "Enter", label: "kbShortcuts.send" },
                  { key: "Shift+Enter", label: "kbShortcuts.newline" },
                  { key: "⌘K", label: "kbShortcuts.search" },
                  { key: "Esc", label: "kbShortcuts.close" },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{t(label)}</span>
                    <kbd className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Divider + Disclaimer inline */}
          <span className="hidden md:inline text-muted-foreground/30 select-none">·</span>
          <span className="hidden md:inline text-[10px] text-muted-foreground/50">
            {t("input.disclaimer")}
          </span>
        </div>
      )}

      {/* Disclaimer mobile-only */}
      {!isSimple && (
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50 md:hidden">
          {t("input.disclaimer")}
        </p>
      )}
    </div>
  )
}

// ── Chat Files Popup ──────────────────────────────────────────────────────────
function ChatFilesButton({ messages, onScrollToMessage }: { messages: ChatMessage[]; onScrollToMessage?: (id: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const chatFiles = messages.flatMap((msg) =>
    (msg.attachments || []).map((att) => ({
      messageId: msg.id,
      name: att.name,
      mimeType: att.mimeType,
      role: msg.role,
    }))
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
          "hover:bg-muted hover:border-border hover:scale-105 active:scale-95",
          "border-border/60 bg-background/40 text-muted-foreground backdrop-blur-sm"
        )}>
          <FolderOpen className="size-3.5" />
          <span>{t("files.chatFilesBtn")}</span>
          {chatFiles.length > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {chatFiles.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" side="top" sideOffset={8} className="glass w-72 rounded-2xl p-0 shadow-lg">
        <div className="border-b border-border/50 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">{t("files.chatFilesTitle")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("files.chatFilesDesc")}</p>
        </div>
        <div className="max-h-52 overflow-y-auto p-2">
          {chatFiles.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t("files.noFilesYet")}</p>
          ) : (
            chatFiles.map((file, i) => (
              <button
                key={`${file.messageId}-${i}`}
                onClick={() => { onScrollToMessage?.(file.messageId); setOpen(false) }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                {file.mimeType.startsWith("image/") ? (
                  <ImageIcon className="size-4 shrink-0 text-blue-500" />
                ) : file.mimeType.startsWith("audio/") ? (
                  <Music className="size-4 shrink-0 text-green-500" />
                ) : file.mimeType.startsWith("video/") ? (
                  <Video className="size-4 shrink-0 text-purple-500" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate text-xs text-foreground">{file.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {file.role === "user" ? "↑" : "AI"}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
