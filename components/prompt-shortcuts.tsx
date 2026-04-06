"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Plus, X, Command, Code, Lightbulb, PenTool, Database, Layout, Star } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Shortcut {
  id: string
  title: string
  prompt: string
  icon: string
  pinned?: boolean
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "1", title: "Resumir finanzas", prompt: "Hazme un resumen de las métricas financieras de este mes", icon: "Database", pinned: true },
  { id: "2", title: "Analizar retención", prompt: "Analiza la tasa de retención de los barberos y dame insights", icon: "Lightbulb" }
]

const ICONS: Record<string, React.ReactNode> = {
  Command: <Command className="size-3.5" />,
  Code: <Code className="size-3.5" />,
  Lightbulb: <Lightbulb className="size-3.5" />,
  PenTool: <PenTool className="size-3.5" />,
  Database: <Database className="size-3.5" />,
  Layout: <Layout className="size-3.5" />
}

export function PromptShortcuts({ onExecute }: { onExecute: (prompt: string) => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newPrompt, setNewPrompt] = useState("")
  const [newIcon, setNewIcon] = useState("Command")

  useEffect(() => {
    if (!user) return
    const saved = localStorage.getItem(`prompt_shortcuts_${user.uid}`)
    setShortcuts(saved ? JSON.parse(saved) : DEFAULT_SHORTCUTS)
    if (!saved) localStorage.setItem(`prompt_shortcuts_${user.uid}`, JSON.stringify(DEFAULT_SHORTCUTS))
  }, [user])

  const persist = (updated: Shortcut[]) => {
    setShortcuts(updated)
    if (user) localStorage.setItem(`prompt_shortcuts_${user.uid}`, JSON.stringify(updated))
  }

  const handleSave = () => {
    if (!newTitle.trim() || !newPrompt.trim() || !user) return
    persist([...shortcuts, { id: Date.now().toString(), title: newTitle, prompt: newPrompt, icon: newIcon }])
    setIsAdding(false)
    setNewTitle("")
    setNewPrompt("")
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    persist(shortcuts.filter(s => s.id !== id))
  }

  const handleTogglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    persist(shortcuts.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s))
  }

  // Pinned first, then rest — preserve relative order within each group
  const sorted = [
    ...shortcuts.filter(s => s.pinned),
    ...shortcuts.filter(s => !s.pinned),
  ]

  if (isAdding) {
    return (
      <div className="w-full max-w-3xl mx-auto mt-6 px-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="glass rounded-2xl p-4 max-w-sm mx-auto shadow-xl border border-border/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t("app.newShortcut")}</h3>
            <button onClick={() => setIsAdding(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder={t("app.shortcutTitle")}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              placeholder={t("app.shortcutPrompt")}
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
              className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[5rem] resize-none"
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1">
                {Object.keys(ICONS).map(iconName => (
                  <button
                    key={iconName}
                    onClick={() => setNewIcon(iconName)}
                    className={cn("p-1.5 rounded-md transition-all", newIcon === iconName ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted")}
                  >
                    {ICONS[iconName]}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSave}
                disabled={!newTitle.trim() || !newPrompt.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t("app.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto mt-6 px-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {sorted.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onExecute(s.prompt)}
            className={cn(
              "group relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground",
              "transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]",
              "shadow-sm border backdrop-blur-sm glass",
              s.pinned
                ? "border-primary/25 bg-primary/5"
                : "border-border/50",
              "animate-in fade-in slide-in-from-bottom-2"
            )}
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
          >
            {/* Pin indicator */}
            {s.pinned && (
              <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-primary shadow-sm">
                <Star className="size-2 fill-primary-foreground text-primary-foreground" />
              </span>
            )}

            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              {ICONS[s.icon] || <Command className="size-3.5" />}
            </span>
            <span>{s.title}</span>

            {/* Hover actions */}
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
              {/* Pin toggle */}
              <span
                role="button"
                onClick={(e) => handleTogglePin(e, s.id)}
                className={cn(
                  "p-0.5 rounded-full transition-colors",
                  s.pinned
                    ? "text-primary hover:bg-primary/20"
                    : "text-muted-foreground hover:bg-muted hover:text-primary"
                )}
                title={s.pinned ? t("app.unpinShortcut") : t("app.pinShortcut")}
              >
                <Star className={cn("size-3", s.pinned && "fill-primary")} />
              </span>
              {/* Delete */}
              <span
                role="button"
                onClick={(e) => handleDelete(e, s.id)}
                className="p-0.5 rounded-full text-muted-foreground hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                title={t("app.deleteShortcut")}
              >
                <X className="size-3" />
              </span>
            </span>
          </button>
        ))}

        {/* Add shortcut — same pill style */}
        <button
          onClick={() => setIsAdding(true)}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
            "border border-dashed border-border/60 text-muted-foreground",
            "transition-all duration-200 hover:border-primary/50 hover:text-primary hover:bg-primary/5 hover:scale-[1.03] active:scale-[0.97]",
            "animate-in fade-in slide-in-from-bottom-2"
          )}
          style={{ animationDelay: `${sorted.length * 60}ms`, animationFillMode: "both" }}
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">{t("app.addShortcut")}</span>
        </button>
      </div>
    </div>
  )
}
