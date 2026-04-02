"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Plus, X, Command, Code, Lightbulb, PenTool, Database, Layout } from "lucide-react"

export interface Shortcut {
  id: string
  title: string
  prompt: string
  icon: string
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "1", title: "Resumir finanzas", prompt: "Hazme un resumen de las métricas financieras de este mes", icon: "Database" },
  { id: "2", title: "Analizar retención", prompt: "Analiza la tasa de retención de los barberos y dame insights", icon: "Lightbulb" }
]

const ICONS: Record<string, React.ReactNode> = {
  Command: <Command className="size-4" />,
  Code: <Code className="size-4" />,
  Lightbulb: <Lightbulb className="size-4" />,
  PenTool: <PenTool className="size-4" />,
  Database: <Database className="size-4" />,
  Layout: <Layout className="size-4" />
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
    const storageKey = `prompt_shortcuts_${user.uid}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      setShortcuts(JSON.parse(saved))
    } else {
      setShortcuts(DEFAULT_SHORTCUTS)
      localStorage.setItem(storageKey, JSON.stringify(DEFAULT_SHORTCUTS))
    }
  }, [user])

  const handleSave = () => {
    if (!newTitle.trim() || !newPrompt.trim() || !user) return
    const newShortcut: Shortcut = {
      id: Date.now().toString(),
      title: newTitle,
      prompt: newPrompt,
      icon: newIcon
    }
    const updated = [...shortcuts, newShortcut]
    setShortcuts(updated)
    const storageKey = `prompt_shortcuts_${user.uid}`
    localStorage.setItem(storageKey, JSON.stringify(updated))
    setIsAdding(false)
    setNewTitle("")
    setNewPrompt("")
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    if (!user) return
    e.stopPropagation()
    const updated = shortcuts.filter(s => s.id !== id)
    setShortcuts(updated)
    const storageKey = `prompt_shortcuts_${user.uid}`
    localStorage.setItem(storageKey, JSON.stringify(updated))
  }

  return (
    <div className="w-full max-w-3xl mx-auto mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {!isAdding && (
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center justify-center gap-2.5 px-4 max-w-md mx-auto">
          {shortcuts.map(s => (
            <button
              key={s.id}
              onClick={() => onExecute(s.prompt)}
              className="group flex items-center justify-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted/50 hover:scale-[1.02] active:scale-98 shadow-sm border border-border/50 w-full sm:w-auto"
            >
              <div className="text-gemini-star">
                 {ICONS[s.icon] || <Command className="size-4" />}
              </div>
              <span className="truncate">{s.title}</span>
              <div 
                onClick={(e) => handleDelete(e, s.id)}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-rose-500/20 hover:text-rose-500"
                title={t("app.deleteShortcut") || "Eliminar"}
              >
                <X className="size-3" />
              </div>
            </button>
          ))}
          
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:text-primary hover:bg-primary/5 w-full sm:w-auto"
            title={t("app.addShortcut") || "Añadir atajo"}
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {isAdding && (
        <div className="glass rounded-2xl p-4 max-w-sm mx-auto shadow-xl border border-border/50">
          <div className="flex items-center justify-between mb-4 flex-wrap">
             <h3 className="text-sm font-semibold text-foreground">{t("app.newShortcut") || "Nuevo Atajo"}</h3>
             <button onClick={() => setIsAdding(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted">
               <X className="size-4" />
             </button>
          </div>
          <div className="space-y-3">
            <div>
              <input 
                type="text" 
                placeholder={t("app.shortcutTitle") || "Título (ej: Resumir)"} 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <textarea 
                placeholder={t("app.shortcutPrompt") || "Prompt para Rick..."} 
                value={newPrompt}
                onChange={e => setNewPrompt(e.target.value)}
                className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[5rem] resize-none"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1 flex-wrap">
                {Object.keys(ICONS).map(iconName => (
                  <button
                    key={iconName}
                    onClick={() => setNewIcon(iconName)}
                    className={`p-1.5 rounded-md transition-all ${newIcon === iconName ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted'}`}
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
                {t("app.save") || "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
