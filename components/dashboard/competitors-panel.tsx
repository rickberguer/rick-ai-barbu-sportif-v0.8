"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { RefreshCcw, ShieldCheck, Share2, Search, ArrowUpRight, ArrowDownRight, TrendingUp, Sparkles, Activity, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

function GrowthBadge({ value, label, invert = false }: { value: number, label: string, invert?: boolean }) {
  const isPositive = value >= 0
  const isGood = invert ? !isPositive : isPositive
  const color = isGood ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10"
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight
  return (
    <div className="flex flex-col items-start gap-1 p-2 rounded-xl bg-muted/10">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <div className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold w-fit", color)}>
        <Icon className="size-3" />
        {Math.abs(value).toFixed(1)}%
      </div>
    </div>
  )
}

let competitorsCache: any = null

export function CompetitorsPanel() {
  const { t } = useI18n()
  const [data, setData] = useState<any>(competitorsCache)
  const [loading, setLoading] = useState(!competitorsCache)
  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // Load from Cache on first mount if no memory cache
  useEffect(() => {
    if (!competitorsCache) {
      const cached = localStorage.getItem('competitors_cache')
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          competitorsCache = parsed
          setData(parsed)
          setLoading(false)
        } catch (e) {
          console.error("Error parsing competitors cache", e)
        }
      }
    }
  }, [])

  const loadData = async (isRefetch = false) => {
    try {
      setError(null)
      if (isRefetch) setRefreshing(true)
      else if (!data) setLoading(true)

      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("No hay token de autenticación")

      const res = await fetch(`/api/dashboard/competitors${isRefetch ? '?refresh=true' : ''}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())
      const freshData = await res.json()
      competitorsCache = freshData
      setData(freshData)
      localStorage.setItem('competitors_cache', JSON.stringify(freshData))
    } catch (e: any) {
      console.error("Error loading competitors data", e)
      setError(e.message)
    } finally {
      if (isRefetch) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse text-sm">{t("loading.competitors")}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-32 md:pb-6 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              {t("panel.competitors") || "Inteligencia Competitiva"}
            </h2>
            <img src="/logos/semrush.png" alt="Semrush" className="size-6 rounded-md opacity-90 shadow-sm" />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.competitors.desc") || "Análisis de mercado powered by Semrush"}</p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-2 rounded-full glass px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors disabled:opacity-50 text-foreground"
        >
          <RefreshCcw className={cn("size-4", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">{t("panel.financial.update") || "Actualizar"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">

        {/* AI SEARCH SECTION */}
        <div className="lg:col-span-5 glass rounded-[2.5rem] p-6 relative overflow-hidden border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.05)]">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Sparkles className="size-48 text-indigo-500" />
          </div>

          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <Sparkles className="size-5 text-indigo-500" />
              </div>
              <h3 className="font-bold text-lg text-foreground">AI Search</h3>
            </div>
            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-2 py-1 rounded-full uppercase tracking-tighter">
              {data.aiSearch.region}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8 relative z-10">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">AI Visibility</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-indigo-500">{data.aiSearch.visibility}</span>
                <div className="size-2 rounded-full bg-orange-400 animate-pulse"></div>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Mentions</span>
              <span className="text-4xl font-black text-foreground mt-1">{data.aiSearch.mentions}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cited pages</span>
              <span className="text-4xl font-black text-indigo-400 mt-1">{data.aiSearch.citedPages}</span>
            </div>
          </div>

          <div className="space-y-3 relative z-10">
            {data.aiSearch.sources.map((source: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="size-6 rounded-lg bg-muted flex items-center justify-center text-[10px] font-bold">
                    {source.icon === 'chatgpt' ? 'GPT' : 'G'}
                  </div>
                  <span className="text-xs font-medium text-foreground">{source.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-indigo-500">{source.mentions}</span>
                  <span className="text-xs font-bold text-muted-foreground w-6 text-right">{source.pages}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SEO SUMMARY SECTION */}
        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Authority Score */}
          <div className="glass rounded-[2rem] p-6 flex flex-col justify-between border-t-4 border-t-blue-500/40">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{t("panel.competitors.authority") || "Authority Score"}</h3>
                <span className="text-5xl font-black text-foreground mt-2">{data.summary.authorityScore}</span>
              </div>
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <ShieldCheck className="size-5 text-blue-500" />
              </div>
            </div>
            <div className="mt-4">
              <GrowthBadge value={data.summary.authorityGrowth} label="vs año pasado" />
            </div>
          </div>

          {/* Organic Traffic */}
          <div className="glass rounded-[2rem] p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{t("panel.competitors.organicTraffic") || "Organic Traffic"}</h3>
                <span className="text-4xl font-black text-foreground mt-2">{(data.summary.organicTraffic / 1000).toFixed(1)}K</span>
              </div>
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <TrendingUp className="size-5 text-emerald-500" />
              </div>
            </div>
            <div className="mt-4">
              <GrowthBadge value={data.summary.trafficGrowth} label="Tendencia" />
            </div>
          </div>

          {/* Organic Keywords */}
          <div className="glass rounded-[2rem] p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{t("panel.competitors.keywords") || "Organic Keywords"}</h3>
                <span className="text-4xl font-black text-foreground mt-2">{(data.summary.keywords / 1000).toFixed(1)}K</span>
              </div>
              <div className="p-2 bg-amber-500/10 rounded-xl">
                <Search className="size-5 text-amber-500" />
              </div>
            </div>
            <div className="mt-4">
              <GrowthBadge value={data.summary.keywordsGrowth} label="Visibilidad" />
            </div>
          </div>

          {/* SITE AUDIT SECTION (NEW) */}
          <div className="md:col-span-3 glass rounded-[2.5rem] p-6 border-t-4 border-t-emerald-500/40">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-emerald-500" />
                <h3 className="font-bold text-lg text-foreground">Site Audit</h3>
                <span className="text-[10px] text-muted-foreground ml-2">Updated: {data.siteAudit.updatedAt}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="flex flex-col items-center justify-center p-4 bg-emerald-500/5 rounded-3xl border border-emerald-500/10">
                <div className="relative size-24 mb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ value: data.siteAudit.health }, { value: 100 - data.siteAudit.health }]}
                        innerRadius={30}
                        outerRadius={40}
                        startAngle={90}
                        endAngle={450}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="rgba(255,255,255,0.05)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-black text-foreground">{data.siteAudit.health}%</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Site Health</span>
              </div>

              <div className="flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2">
                  <XCircle className="size-4 text-rose-500" />
                  <span className="text-xs font-bold text-muted-foreground uppercase">Errors</span>
                </div>
                <span className="text-3xl font-black text-foreground">{data.siteAudit.errors}</span>
                <span className="text-[10px] font-bold text-emerald-500">{data.siteAudit.errorsGrowth} vs last</span>
              </div>

              <div className="flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  <span className="text-xs font-bold text-muted-foreground uppercase">Warnings</span>
                </div>
                <span className="text-3xl font-black text-foreground">{data.siteAudit.warnings}</span>
                <span className="text-[10px] font-bold text-rose-500">+{data.siteAudit.warningsGrowth}</span>
              </div>

              <div className="flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  <span className="text-xs font-bold text-muted-foreground uppercase">Crawled</span>
                </div>
                <span className="text-3xl font-black text-foreground">{data.siteAudit.crawledPages}</span>
                <span className="text-[10px] text-muted-foreground font-medium">Pages scanned</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
        {/* Visibility Evolution Chart */}
        <div className="glass rounded-3xl p-6 flex flex-col h-full overflow-hidden">
          <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
            <Activity className="size-5 text-indigo-500" />
            Visibility Evolution (Keywords Top 100)
          </h3>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.keywordEvolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Competitors Table */}
        <div className="glass rounded-3xl p-6 flex flex-col h-full overflow-hidden">
          <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
            <Share2 className="size-5 text-indigo-500" />
            {t("panel.competitors.topCompetitors") || "Top Competitors"}
          </h3>
          <div className="flex-1 overflow-y-auto pr-2">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/5">
                  <th className="pb-3 pr-4">Domain</th>
                  <th className="pb-3 px-4">Authority</th>
                  <th className="pb-3 px-4">Traffic</th>
                  <th className="pb-3 pl-4">Overlap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.topCompetitors.map((comp: any, i: number) => (
                  <tr key={i} className="group/row hover:bg-white/5 transition-colors">
                    <td className="py-4 pr-4">
                      <span className="text-xs font-bold text-foreground block group-hover/row:text-primary transition-colors">{comp.domain}</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden max-w-[40px]">
                          <div className="h-full bg-blue-500" style={{ width: `${comp.authority}%` }} />
                        </div>
                        <span className="text-[10px] font-black">{comp.authority}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-[10px] font-bold text-muted-foreground">{(comp.traffic / 1000).toFixed(1)}K</span>
                    </td>
                    <td className="py-4 pl-4">
                      <span className="text-[10px] font-black text-emerald-500">{comp.overlap}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
