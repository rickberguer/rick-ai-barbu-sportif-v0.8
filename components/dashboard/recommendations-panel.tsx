"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import {
  RefreshCcw, Sparkles, Lightbulb, TrendingUp,
  CheckCircle2, AlertCircle, ArrowRight, Zap,
  Star, ExternalLink, Copy, Check, Video, Image as ImageIcon, X
} from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"

let recommendationsCache: any = null

export function RecommendationsPanel() {
  const { t, locale } = useI18n()
  const [data, setData] = useState<any>(recommendationsCache)
  const [loading, setLoading] = useState(!recommendationsCache)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedRec, setSelectedRec] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  const loadData = async () => {
    try {
      if (!data) setLoading(true)
      const token = await auth.currentUser?.getIdToken()
      if (!token) return

      const res = await fetch("/api/dashboard/recommendations", {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())
      const freshData = await res.json()
      recommendationsCache = freshData
      setData(freshData)
    } catch (e) {
      console.error("Error loading recommendations", e)
    } finally {
      setLoading(false)
    }
  }

  const runAnalysis = async () => {
    try {
      setAnalyzing(true)
      const token = await auth.currentUser?.getIdToken()
      const langMap: any = { "fr-CA": "fr", "en-CA": "en", "es-MX": "es" }
      const shortLocale = langMap[locale] || "es"

      const res = await fetch("/api/dashboard/recommendations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ locale: shortLocale })
      })

      if (!res.ok) throw new Error("Error en el análisis")
      toast.success("¡Análisis completado! Rick ha generado nuevas estrategias.")
      await loadData()
    } catch (e) {
      toast.error("No se pudo completar el análisis estratégico.")
    } finally {
      setAnalyzing(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("Prompt copiado al portapapeles")
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse">Rick está preparando la mesa de estrategia...</p>
        </div>
      </div>
    )
  }

  const hero = data?.hero
  const strategies = data?.strategies || []

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-32 md:pb-6 overflow-y-auto overflow-x-hidden animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Sparkles className="size-8 text-gemini-star" />
            {t("panel.recommendations") || "Estrategias & IA"}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            {t("panel.recommendations.desc") || "Rick analiza tus KPIs en tiempo real para ofrecerte ventajas competitivas y optimización operativa."}
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="relative group overflow-hidden px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-bold shadow-2xl hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
        >
          <div className="relative z-10 flex items-center gap-2">
            {analyzing ? <RefreshCcw className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {analyzing ? (t("panel.recommendations.loading") || "Analizando...") : (t("panel.recommendations.execute") || "Analiza y Recomienda")}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </button>
      </div>

      {!hero && !analyzing && (
        <div className="flex-1 flex flex-col items-center justify-center p-12 glass rounded-[3rem] border-dashed">
          <AlertCircle className="size-16 text-muted-foreground/30 mb-6" />
          <h3 className="text-xl font-semibold text-muted-foreground text-center">
            {t("panel.recommendations.no_analysis") || "No hay análisis recientes."}
          </h3>
          <p className="text-muted-foreground mt-2 text-center max-w-sm">
            {t("panel.recommendations.start_desc") || "Haz clic en el botón superior para que Rick analice el estado actual."}
          </p>
        </div>
      )}

      {hero && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Main Hero Strategy (Special UI) */}
          <div
            onClick={() => setSelectedRec(hero)}
            className="col-span-1 md:col-span-2 lg:col-span-3 glass rounded-[3rem] p-8 md:p-12 border-2 border-primary/20 hover:border-primary/50 cursor-pointer transition-all group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <Sparkles className="size-64 text-primary" />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-8">
              <div className="size-24 rounded-[2rem] bg-primary/10 flex items-center justify-center shrink-0 shadow-inner group-hover:rotate-12 transition-transform">
                <TrendingUp className="size-12 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-4 py-1.5 rounded-full bg-primary/20 text-primary text-xs font-black uppercase tracking-widest">
                    {t("panel.recommendations.hero") || "Inspiración Principal"}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-500 font-bold text-sm">
                    <TrendingUp className="size-4" /> {hero.impact}
                  </span>
                </div>
                <h3 className="text-4xl font-extrabold text-foreground mb-4 leading-tight">{hero.title}</h3>
                <p className="text-xl text-muted-foreground max-w-4xl line-clamp-2">
                  {hero.simplifiedSummary || hero.description}
                </p>
              </div>
              <ArrowRight className="size-10 text-primary opacity-0 group-hover:opacity-100 -translate-x-10 group-hover:translate-x-0 transition-all duration-500" />
            </div>
          </div>

          {/* Secondary Strategies */}
          {strategies.map((strat: any) => (
            <div
              key={strat.id}
              onClick={() => setSelectedRec(strat)}
              className="group glass rounded-[2.5rem] p-8 flex flex-col hover:border-primary/40 cursor-pointer transition-all hover:-translate-y-2 shadow-sm hover:shadow-xl"
            >
              <div className="flex items-start justify-between mb-8">
                <div className={cn(
                  "p-5 rounded-3xl transition-all group-hover:rotate-6 shadow-inner",
                  strat.type === 'Marketing' ? "bg-indigo-500/10 text-indigo-500" :
                    strat.type === 'Operaciones' ? "bg-amber-500/10 text-amber-500" :
                      strat.type === 'Finanzas' ? "bg-emerald-500/10 text-emerald-500" :
                        "bg-rose-500/10 text-rose-500"
                )}>
                  {strat.type === 'Marketing' ? <Zap className="size-7" /> :
                    strat.type === 'Operaciones' ? <Star className="size-7" /> :
                      strat.type === 'Finanzas' ? <TrendingUp className="size-7" /> :
                        <Lightbulb className="size-7" />}
                </div>
                <div className={cn(
                  "px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border",
                  strat.priority === 'Urgente' ? "bg-rose-500/10 border-rose-500/20 text-rose-600" :
                    strat.priority === 'Alta' ? "bg-amber-500/10 border-amber-500/20 text-amber-600" :
                      "bg-muted border-border/50 text-muted-foreground"
                )}>
                  {t(`rec.priority.${strat.priority}`) || strat.priority}
                </div>
              </div>

              <h4 className="text-2xl font-bold text-foreground mb-3 leading-tight group-hover:text-primary transition-colors">{strat.title}</h4>
              <p className="text-muted-foreground mb-8 text-lg font-medium leading-relaxed flex-1">
                {strat.simplifiedSummary || strat.action}
              </p>

              <div className="mt-auto pt-6 border-t border-border flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{strat.impact ? (t("panel.recommendations.impact_est") || "Impacto Estimado") : (t(`rec.type.${strat.type}`) || strat.type)}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold text-foreground">{strat.impact}</span>
                  </div>
                </div>
                <div className="size-10 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                  <ArrowRight className="size-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded Recommendation Modal */}
      <Dialog open={!!selectedRec} onOpenChange={() => setSelectedRec(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border border-border rounded-[3rem] max-h-[90vh] flex flex-col shadow-2xl select-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedRec?.title || (t("panel.recommendations") || "Recomendamiento Estratégico")}</DialogTitle>
            <DialogDescription>
              {t("panel.recommendations.desc") || "Detalles completos de la sugerencia de Rick."}
            </DialogDescription>
          </DialogHeader>

          {/* Botón de cerrar explícito y elevado */}
          <DialogClose asChild>
            <button className="absolute top-6 right-6 z-[999] p-3 rounded-full bg-muted/80 hover:bg-muted border border-border backdrop-blur-md text-foreground/80 hover:text-foreground transition-all cursor-pointer">
              <X className="size-5" />
            </button>
          </DialogClose>

          <div className="absolute top-0 right-0 p-24 opacity-5 pointer-events-none">
            <Sparkles className="size-96 text-primary" />
          </div>

          <div className="p-8 md:p-12 overflow-y-auto custom-scrollbar flex-1 relative z-10">
            {selectedRec && (
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="flex items-center gap-4 mb-6">
                  <div className={cn(
                    "p-4 rounded-2xl",
                    selectedRec.type === 'Marketing' ? "bg-indigo-500/10 text-indigo-500" : "bg-primary/10 text-primary"
                  )}>
                    {selectedRec.type === 'Marketing' ? <Zap className="size-6" /> : <Lightbulb className="size-6" />}
                  </div>
                  <div>
                    <span className="text-sm font-black text-primary uppercase tracking-[0.2em]">{t(`rec.type.${selectedRec.type}`) || selectedRec.type}</span>
                    <h2 className="text-4xl font-extrabold text-foreground tracking-tight">{selectedRec.title}</h2>
                  </div>
                </div>

                <div className="prose dark:prose-invert max-w-none prose-p:text-xl prose-p:text-muted-foreground prose-p:leading-relaxed prose-headings:text-foreground prose-strong:text-foreground">
                  {/* Simple markdown-ish rendering */}
                  {selectedRec.content?.split('\n').map((line: string, i: number) => {
                    if (line.startsWith('### ')) return <h3 key={i} className="text-2xl font-bold mt-8 mb-4">{line.replace('### ', '')}</h3>
                    if (line.startsWith('## ')) return <h2 key={i} className="text-3xl font-bold mt-10 mb-6">{line.replace('## ', '')}</h2>
                    if (line.startsWith('- ')) return <li key={i} className="text-lg text-muted-foreground mb-2 list-none flex gap-2"><CheckCircle2 className="size-5 text-primary shrink-0 mt-1" /> {line.replace('- ', '')}</li>
                    return <p key={i} className="mb-4 text-lg text-muted-foreground leading-relaxed">{line}</p>
                  }) || selectedRec.description || selectedRec.action}
                </div>

                {/* Direct Links */}
                {selectedRec.links && selectedRec.links.length > 0 && (
                  <div className="mt-12 flex flex-wrap gap-4">
                    {selectedRec.links.map((link: any, i: number) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-6 py-3 rounded-2xl glass hover:bg-muted/50 border border-border/50 transition-all font-bold text-foreground overflow-hidden group"
                      >
                        <ExternalLink className="size-5 text-primary group-hover:scale-110 transition-transform" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}


              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
