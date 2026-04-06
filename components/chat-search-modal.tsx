"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, MessageSquare, Sparkles } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/components/chat-area"

interface ChatSearchModalProps {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  onScrollToMessage: (id: string) => void
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/25 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function excerpt(text: string, query: string, maxLen = 120): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen)
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + query.length + 60)
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "")
}

export function ChatSearchModal({ open, onClose, messages, onScrollToMessage }: ChatSearchModalProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      if (e.key === "Enter") {
        e.preventDefault()
        if (results[selectedIndex]) {
          onScrollToMessage(results[selectedIndex].id)
          onClose()
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, selectedIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const results = query.trim().length < 2
    ? []
    : messages.filter(m =>
        m.content?.toLowerCase().includes(query.toLowerCase()) &&
        m.content.trim().length > 0
      )

  // Reset index when results change
  useEffect(() => { setSelectedIndex(0) }, [results.length, query])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      item?.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const handleSelect = useCallback((id: string) => {
    onScrollToMessage(id)
    onClose()
  }, [onScrollToMessage, onClose])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative w-full max-w-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="glass rounded-2xl shadow-2xl border border-border/60 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            {query.trim().length < 2 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Search className="size-6 opacity-30" />
                <p className="text-xs">{t("search.hint")}</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <MessageSquare className="size-6 opacity-30" />
                <p className="text-sm">{t("search.noResults")}</p>
              </div>
            ) : (
              <div className="p-2 flex flex-col gap-1">
                {results.map((msg, i) => (
                  <button
                    key={msg.id}
                    data-index={i}
                    onClick={() => handleSelect(msg.id)}
                    className={cn(
                      "w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150",
                      "flex items-start gap-3",
                      i === selectedIndex
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/60 border border-transparent"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                      msg.role === "assistant" ? "bg-primary/10" : "bg-muted"
                    )}>
                      {msg.role === "assistant"
                        ? <Sparkles className="size-3 text-primary" />
                        : <MessageSquare className="size-3 text-muted-foreground" />
                      }
                    </div>
                    {/* Excerpt */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wider">
                        {msg.role === "assistant" ? "Rick AI" : t("header.assistant").split(" ")[0]}
                      </p>
                      <p className="text-sm text-foreground leading-relaxed line-clamp-2">
                        {highlight(excerpt(msg.content, query), query)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {results.length > 0 && (
            <div className="border-t border-border/50 px-4 py-2 flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">{results.length} résultats</span>
              <span className="ml-auto text-[10px] text-muted-foreground hidden sm:block">{t("search.hint")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
