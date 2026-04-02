"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { RefreshCcw, Users, Heart, Target, Zap, ArrowUpRight, ArrowDownRight, Megaphone, Share2, BarChart2, DollarSign } from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'

function GrowthBadge({ value, label }: { value: number, label: string }) {
  const isPositive = value >= 0
  const color = isPositive ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10"
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight
  return (
    <div className="flex flex-col items-start gap-1 p-3 rounded-2xl bg-muted/20">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <div className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold w-fit", color)}>
        <Icon className="size-3" />
        {Math.abs(value).toFixed(1)}%
      </div>
    </div>
  )
}

const marketingMemCache = new Map<string, any>()

export function MarketingPanel() {
  const { t } = useI18n()
  
  // Try to load initial from cache if exists for default period (30d)
  const getInitial = (p: string) => {
    if (marketingMemCache.has(p)) return marketingMemCache.get(p)
    if (typeof window !== 'undefined') {
      const loc = localStorage.getItem(`marketing_cache_${p}`)
      if (loc) {
        try { 
          const parsed = JSON.parse(loc);
          marketingMemCache.set(p, parsed);
          return parsed;
        } catch(e){}
      }
    }
    return null
  }

  const [period, setPeriod] = useState("30d")
  const initialData = getInitial("30d")
  const [data, setData] = useState<any>(initialData)
  const [loading, setLoading] = useState(!initialData)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Update local state smoothly when period changes without showing full loading state if we have it
  useEffect(() => {
    const cached = getInitial(period)
    if (cached) {
      if (!data || data !== cached) setData(cached)
      setLoading(false)
    } else {
      setData(null)
      setLoading(true)
    }
  }, [period])

  const loadData = async (isRefetch = false, selectedPeriod = period) => {
    try {
      setError(null)
      if (isRefetch) setRefreshing(true)
      else if (!data) setLoading(true) // Only show skeleton if no cached data

      // Wait a bit for auth to initialize if needed
      let currentUser = auth.currentUser
      if (!currentUser) {
        // Try to wait up to 2 seconds for auth
        await new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
              currentUser = user
              unsubscribe()
              resolve(user)
            }
          })
          setTimeout(() => {
            unsubscribe()
            resolve(null)
          }, 2000)
        })
      }

      if (!currentUser) {
        throw new Error("No se pudo detectar un usuario activo. Por favor, recarga la página.")
      }

      const token = await currentUser.getIdToken()
      const res = await fetch(`/api/dashboard/marketing?period=${selectedPeriod}${isRefetch ? '&refresh=true' : ''}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || "Error al obtener datos")
      }

      const freshData = await res.json()
      marketingMemCache.set(selectedPeriod, freshData)
      setData(freshData)
      localStorage.setItem(`marketing_cache_${selectedPeriod}`, JSON.stringify(freshData))
    } catch (e: any) {
      console.error("Error loading marketing data", e)
      setError(e.message || "Error desconocido")
    } finally {
      if (isRefetch) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [period])

  const PeriodButton = ({ value, label }: { value: string, label: string }) => (
    <button
      onClick={() => setPeriod(value)}
      className={cn(
        "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
        period === value ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-muted/20 text-muted-foreground"
      )}
    >
      {label}
    </button>
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-[0_0_20px_rgba(var(--primary),0.3)]" />
          <div className="space-y-1">
            <p className="text-foreground font-bold text-sm tracking-wide">{t("loading.marketing")}</p>
            <p className="text-muted-foreground animate-pulse text-[11px]">{t("loading.marketing.desc")}</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-6 max-w-md glass p-8 rounded-3xl">
          <div className="size-16 rounded-full bg-rose-500/10 flex items-center justify-center">
            <Target className="size-8 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground">{t("loading.connectionError")}</h3>
            <p className="text-sm text-muted-foreground">{error.includes("No credentials") ? t("loading.sessionExpired") : error}</p>
          </div>
          <button
            onClick={() => loadData()}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <RefreshCcw className="size-4" />
            {t("loading.retry")}
          </button>
        </div>
      </div>
    )
  }

  const CampaignTable = ({ title, campaigns, icon: Icon, color }: { title: string, campaigns: any[], icon: any, color: string }) => (
    <div className="glass rounded-3xl p-6 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
          <Icon className={cn("size-5", color)} />
          {title}
        </h3>
        <span className="text-[10px] bg-muted/20 px-2 py-0.5 rounded-full text-muted-foreground font-bold uppercase">{campaigns?.length || 0} {t("panel.marketing.active")}</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {!campaigns || campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 opacity-40">
            <Target className="size-8 mb-2" />
            <span className="text-xs">{t("panel.marketing.noActivity")}</span>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-white/5">
                <th className="pb-3 pr-4">{t("panel.marketing.campaign")}</th>
                <th className="pb-3 px-4 text-right">{t("panel.marketing.views")}</th>
                <th className="pb-3 px-4 text-right tabular-nums">{t("panel.marketing.clicks")}</th>
                <th className="pb-3 px-4 text-right text-emerald-500 tabular-nums">{t("panel.marketing.conversions")}</th>
                <th className="pb-3 px-4 text-right tabular-nums">{t("panel.marketing.spend")}</th>
                <th className="pb-3 pl-4 text-right tabular-nums">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {campaigns.map((camp: any, i: number) => (
                <tr key={i} className="group/row hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 pr-4">
                    <span className="text-sm font-bold text-foreground group-hover/row:text-primary transition-colors truncate max-w-[120px] block">
                      {camp.name}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right tabular-nums text-[11px] text-muted-foreground">
                    {camp.impressions?.toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-right tabular-nums text-[11px] text-muted-foreground">
                    {camp.clicks?.toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-right tabular-nums text-[11px] font-bold text-emerald-500">
                    {camp.conversions?.toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-right tabular-nums text-[11px] font-medium">
                    ${camp.spend?.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                  </td>
                  <td className="py-4 pl-4 text-right">
                    <span className={cn(
                      "text-[11px] font-black tabular-nums",
                      camp.roi >= 3 ? "text-emerald-500" : camp.roi >= 1 ? "text-yellow-500" : "text-rose-500"
                    )}>
                      x{camp.roi?.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  if (!data) return (
    <div className="flex h-full items-center justify-center p-6 text-muted-foreground animate-pulse">
      {t("loading.noData")}
    </div>
  )

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-48 md:pb-10 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              {t("panel.marketing") || "Marketing & Publicidad"}
            </h2>
            <div className="flex items-center -space-x-2">
              <img src="/logos/meta.png" alt="Meta" className="size-6 rounded-full border-2 border-background z-30 shadow-sm" />
              <img src="/logos/google.png" alt="Google" className="size-6 rounded-full border-2 border-background z-20 shadow-sm" />
              <img src="/logos/mailgun.png" alt="Mailgun" className="size-6 rounded-full border-2 border-background z-10 shadow-sm" />
            </div>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.marketing.desc") || "Impacto en redes y retorno de inversión"}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="glass p-1 rounded-xl flex items-center">
            <PeriodButton value="7d" label={t("panel.marketing.period7d")} />
            <PeriodButton value="30d" label={t("panel.marketing.period30d")} />
            <PeriodButton value="90d" label={t("panel.marketing.period90d")} />
            <PeriodButton value="year" label={t("panel.marketing.periodYear")} />
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 rounded-xl glass px-4 py-2 text-xs font-bold hover:bg-muted/20 transition-all active:scale-95 disabled:opacity-50 text-foreground"
          >
            <RefreshCcw className={cn("size-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6 shrink-0">
        {/* Reach Card */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Users className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.marketing.reach")}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.marketing.impressions")}</span>
          <span className="text-4xl font-black text-foreground mb-6 z-10 tabular-nums">
            {data.summary.totalReach >= 1000000
              ? `${(data.summary.totalReach / 1000000).toFixed(1)}M`
              : data.summary.totalReach >= 1000
                ? `${(data.summary.totalReach / 1000).toFixed(1)}k`
                : data.summary.totalReach}
          </span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.reachGrowth} label={t("panel.marketing.growthVsPrev")} />
          </div>
        </div>

        {/* Engagement Card */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Heart className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.marketing.engagement")}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.marketing.avgInteraction")}</span>
          <span className="text-4xl font-bold text-foreground mb-6 z-10">{data.summary.avgEngagement}%</span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.engagementGrowth} label={t("panel.marketing.avgInteraction")} />
          </div>
        </div>

        {/* ROI Card */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.marketing.roi")}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.marketing.adReturn")}</span>
          <span className="text-4xl font-bold text-foreground mb-6 z-10">x{data.summary.avgRoi}</span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.roiGrowth} label={t("panel.marketing.adReturn")} />
          </div>
        </div>

        {/* Total Cost Card */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group border-t-4 border-t-rose-500/30">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign className="size-24 text-rose-500" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.marketing.totalCost")}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.marketing.totalCostDesc")}</span>
          <span className="text-4xl font-black text-rose-500 mb-6 z-10 tabular-nums">
            ${data.summary.totalSpend >= 1000
              ? `${(data.summary.totalSpend / 1000).toFixed(1)}k`
              : data.summary.totalSpend?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.spendGrowth || 0} label={t("panel.marketing.growthVsPrev")} />
          </div>
        </div>

        {/* Campaigns Card */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.marketing.campaigns")}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.marketing.activeActions")}</span>
          <span className="text-4xl font-bold text-foreground mb-6 z-10">{data.summary.activeCampaigns}</span>
          <div className="mt-auto pt-4 border-t border-border flex items-center gap-2">
            <Megaphone className="size-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">{t("panel.marketing.optimizingAI")}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 flex-1 min-h-[1200px]">
        {/* Fila 1: Gráfico y Meta */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass rounded-3xl p-6 flex flex-col min-h-[450px]">
            <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
              <BarChart2 className="size-5 text-pink-500" />
              {t("panel.marketing.reachEvolution")} ({period})
            </h3>
            <div className="flex-1 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyReach} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                    labelStyle={{ color: '#aaa', fontSize: '10px', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="reach" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorReach)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-6 pt-6 border-t border-white/5 overflow-x-auto">
              {data.platforms.map((plat: any, i: number) => (
                <div key={i} className="flex items-center gap-2 shrink-0 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                  <div className="size-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: plat.color }} />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{plat.name} ({plat.engagement}%)</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-1 h-[450px]">
            <CampaignTable
              title="Meta (FB & IG)"
              campaigns={data.campaigns.meta}
              icon={Share2}
              color="text-blue-500"
            />
          </div>
        </div>

        {/* Fila 2: Google y Mailgun */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[450px]">
          <CampaignTable
            title="Google Ads Search/Display"
            campaigns={data.campaigns.google}
            icon={Target}
            color="text-emerald-500"
          />
          <CampaignTable
            title="Email Marketing (Mailgun)"
            campaigns={data.campaigns.mailgun}
            icon={Megaphone}
            color="text-rose-500"
          />
        </div>
      </div>
    </div>
  )
}
