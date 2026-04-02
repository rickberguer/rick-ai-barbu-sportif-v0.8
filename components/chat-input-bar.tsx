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
  messages?: ChatMessage[]
  onScrollToMessage?: (messageId: string) => void
  isSimple?: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, resolveReject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the data:...;base64, prefix
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
  messages = [], 
  onScrollToMessage,
  isSimple = false
}: ChatInputBarProps) {
  const { t } = useI18n()
  const [message, setMessage] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Pending attachments before sending
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // --- File handling ---
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
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
      }
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [processFiles]
  )

  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
      }
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

  // --- Audio Recording ---
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
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

        // Convert audio blob to base64 attachment
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(",")[1]
          setPendingAttachments((prev) => [
            ...prev,
            {
              name: `audio-${Date.now()}.webm`,
              mimeType: "audio/webm",
              data: base64,
            },
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      // Revoke all preview URLs
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
    onSendMessage(
      message.trim(),
      pendingAttachments.length > 0 ? pendingAttachments : undefined,
      activeTool
    )
    setMessage("")
    setPendingAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Handle clipboard paste (images, screenshots, files)
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
      <div className="glass-input flex flex-col rounded-3xl shadow-sm transition-shadow focus-within:shadow-md">
        {/* --- ADVERTENCIA DE PROCESAMIENTO --- */}
        {isLoading && (
          <div className="flex animate-pulse items-center justify-center gap-2 border-b border-border/50 px-4 py-2.5">
            <AlertTriangle className="size-4 shrink-0 text-amber-500/80" />
            <span className="text-center text-xs text-amber-500/90">
              {t("input.processingWarning")}
            </span>
          </div>
        )}

        {/* Active tool indicator chip */}
        {!isSimple && activeTool && (
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5">
              <span className="size-2 rounded-full bg-primary" />
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

        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className="group relative flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2"
              >
                {att.mimeType.startsWith("image/") && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="size-10 rounded-lg object-cover"
                    crossOrigin="anonymous"
                  />
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
          {/* File attach button */}
          {!isSimple && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                    aria-label={t("input.attach")}
                  >
                    <Plus className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("input.attach")}</TooltipContent>
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}

          {/* Camera button - mobile/tablet only */}
          {!isSimple && (
            <>
              <div className="md:hidden">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                      aria-label={t("input.camera")}
                    >
                      <Camera className="size-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("input.camera")}</TooltipContent>
                </Tooltip>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraCapture}
                className="hidden"
              />
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

        {/* Bottom row */}
        <div className="flex items-center justify-between px-3 pb-2 pt-0">
          <div className="flex items-center gap-1">
            {!isSimple && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                      <path d="M12 2v2" />
                      <path d="M12 22v-2" />
                      <path d="m17 20.66-1-1.73" />
                      <path d="M11 10.27 7 3.34" />
                      <path d="m20.66 17-1.73-1" />
                      <path d="m3.34 7 1.73 1" />
                      <path d="M14 12h8" />
                      <path d="M2 12h2" />
                      <path d="m20.66 7-1.73 1" />
                      <path d="m3.34 17 1.73-1" />
                      <path d="m17 3.34-1 1.73" />
                      <path d="m11 13.73-4 6.93" />
                    </svg>
                    <span className="hidden sm:inline">{t("input.tools")}</span>
                    {activeTool && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  sideOffset={8}
                  className="glass w-64 rounded-2xl p-2 shadow-lg"
                >
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
            )}

            {!isSimple && (
              /* Chat files button */
              <ChatFilesButton messages={messages} onScrollToMessage={onScrollToMessage} />
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Microphone / Recording */}
            {!isSimple && (
              isRecording ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <span className="size-2 animate-pulse rounded-full bg-destructive" />
                    {t("input.recording")} {formatDuration(recordingDuration)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={stopRecording}
                        className="flex size-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
                        aria-label={t("input.stopRecording")}
                      >
                        <Square className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("input.stop")}</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={startRecording}
                      className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                      aria-label={t("input.voiceInput")}
                    >
                      <Mic className="size-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t("input.voiceInput")}</TooltipContent>
                </Tooltip>
              )
            )}

            {/* Model selector (rapido / pro) */}
            {!isSimple && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                      modelSelected === "pro"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {modelSelected === "pro" ? (
                      <Sparkles className="size-3" />
                    ) : (
                      <Zap className="size-3" />
                    )}
                    <span className="hidden sm:inline">{modelSelected === "pro" ? "Pro" : t("input.modelFast")}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="top"
                  sideOffset={8}
                  className="glass w-44 rounded-xl p-1.5 shadow-lg"
                >
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
                      <span className="text-[10px] text-muted-foreground">{t("input.modelProDesc")}</span>
                    </div>
                    {modelSelected === "pro" && <span className="ml-auto size-2 rounded-full bg-primary" />}
                  </button>
                </PopoverContent>
              </Popover>
            )}

            {isLoading ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onStopGeneration}
                    className="flex size-9 items-center justify-center rounded-full bg-destructive/20 text-destructive transition-colors hover:bg-destructive/30"
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
                className={cn("flex size-9 items-center justify-center rounded-full transition-colors", canSend ? "bg-foreground text-background hover:bg-foreground/90" : "bg-muted text-muted-foreground cursor-not-allowed")}
                aria-label={t("input.send")}
              >
                <ArrowUp className="size-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {t("input.disclaimer")}
      </p>
    </div>
  )
}

// --- Chat Files Popup ---
function ChatFilesButton({ messages, onScrollToMessage }: { messages: ChatMessage[]; onScrollToMessage?: (id: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  // Collect all files from messages
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
        <button
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          <FolderOpen className="size-4" />
          <span className="hidden sm:inline">{t("files.chatFilesBtn")}</span>
          {chatFiles.length > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {chatFiles.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="glass w-72 rounded-2xl p-0 shadow-lg"
      >
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
                onClick={() => {
                  onScrollToMessage?.(file.messageId)
                  setOpen(false)
                }}
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
                  {file.role === "user" ? "^" : "AI"}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
