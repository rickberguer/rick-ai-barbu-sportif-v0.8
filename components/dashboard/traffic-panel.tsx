"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { RefreshCcw, Globe, Users, Eye, Clock, ArrowUpRight, ArrowDownRight, Activity, MousePointer2, UserCheck, BarChart2, Share2 } from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
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

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}m ${secs}s`
}

const COLORS = ['#818cf8', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
let trafficMemoryCache: any = null;

export function TrafficPanel() {
  const { t } = useI18n()
  const getInitial = () => {
    if (trafficMemoryCache) return trafficMemoryCache;
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('traffic_cache')
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          trafficMemoryCache = parsed
          return parsed
        } catch (e) {}
      }
    }
    return null;
  }

  const initialData = getInitial()
  const [data, setData] = useState<any>(initialData)
  const [liveVisitors, setLiveVisitors] = useState(0)
  const [loading, setLoading] = useState(!initialData)
  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState<string | null>(null)
  // Removed initial load from local storage since it's done synchronously in getInitial


  const loadData = async (isRefetch = false) => {
    try {
      setError(null)
      if (isRefetch) setRefreshing(true)
      else if (!data) setLoading(true)

      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("No hay token de autenticación")

      const res = await fetch(`/api/dashboard/traffic${isRefetch ? '?refresh=true' : ''}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())

      const freshData = await res.json()
      trafficMemoryCache = freshData
      setData(freshData)
      localStorage.setItem('traffic_cache', JSON.stringify(freshData))

      // Initial live sync
      fetchLive()
    } catch (e: any) {
      console.error("Error loading traffic data", e)
      setError(e.message)
    } finally {
      if (isRefetch) setRefreshing(false)
      else setLoading(false)
    }
  }

  const fetchLive = async () => {
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) return
      const res = await fetch("/api/dashboard/traffic/live", {
        headers: { "Authorization": `Bearer ${token}` }
      })
      if (res.ok) {
        const live = await res.json()
        setLiveVisitors(live.visitors)
      }
    } catch (e) {
      console.error("Live poll failed", e)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(fetchLive, 25000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse text-sm">{t("loading.traffic")}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-48 md:pb-10 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              {t("panel.traffic") || "Tráfico Web y Audiencia"}
            </h2>
            <img src="/logos/matomo.png" alt="Matomo" className="size-6 object-contain opacity-90" />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.traffic.desc") || "Analíticas impulsadas por Matomo"}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6 shrink-0">

        {/* Live Visitors */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
          <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Live</span>
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.traffic.live") || "Usuarios Activos"}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.traffic.realtime") || "En tiempo real (30m)"}</span>
          <span className="text-5xl font-bold text-foreground mb-6 z-10 tabular-nums">{liveVisitors}</span>
          <div className="mt-auto pt-4 border-t border-border flex items-center gap-2">
            <Users className="size-4 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase text-[9px]">{t("panel.traffic.sync") || "Sincronizado cada 25s"}</span>
          </div>
        </div>

        {/* Origen de Visitas (Chart) */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <BarChart2 className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.traffic.referrers") || "Origen de Visitas"}</h3>
          <span className="text-xs text-muted-foreground mb-2">{t("panel.traffic.byChannel") || "Por tipo de canal"}</span>

          <div className="flex-1 min-h-[140px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.referrers || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={50}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(data.referrers || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                  itemStyle={{ padding: '2px 0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2">
            {(data.referrers || []).map((ref: any, idx: number) => {
              const total = (data.referrers || []).reduce((acc: number, curr: any) => acc + curr.value, 0);
              const percentage = total > 0 ? ((ref.value / total) * 100).toFixed(1) : 0;
              return (
                <div key={idx} className="flex items-center justify-between group/item">
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full ring-2 ring-background shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-[11px] font-medium text-muted-foreground group-hover/item:text-foreground transition-colors">{ref.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-foreground tabular-nums">{ref.value.toLocaleString()}</span>
                    <span className="text-[10px] bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground font-medium w-10 text-center">{percentage}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {data.socials && data.socials.length > 0 && (
            <div className="mt-6 pt-4 border-t border-white/5">
              <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Share2 className="size-3 text-blue-400" />
                {t("panel.traffic.socialsDetail") || "Redes Sociales"}
              </h4>
              <div className="flex items-center gap-4">
                <div className="size-[80px] shrink-0 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.socials}
                        cx="50%"
                        cy="50%"
                        innerRadius={18}
                        outerRadius={32}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {data.socials.map((entry: any, index: number) => (
                          <Cell key={`social-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5">
                  {data.socials.map((soc: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px] group/soc">
                      <div className="flex items-center gap-1.5">
                        <div className="size-1.5 rounded-full ring-1 ring-background" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground group-hover/soc:text-foreground transition-colors">{soc.name}</span>
                      </div>
                      <span className="font-bold text-foreground tabular-nums">{soc.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pageviews */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Eye className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.traffic.pageviews") || "Páginas Vistas"}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.traffic.last30days") || "Últimos 30 días"}</span>
          <span className="text-4xl font-bold text-foreground mb-6 z-10">{data.summary.pageviews || 0}</span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.pageviewsGrowth} label="vs Mes pasado" />
          </div>
        </div>

        {/* Avg Time */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.traffic.avgTime") || "Tiempo Promedio"}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.traffic.avgTime") || "Tiempo en sitio"}</span>
          <span className="text-4xl font-bold text-foreground mb-6 z-10">{formatDuration(data.summary.avgTime)}</span>
          <div className="mt-auto pt-4 border-t border-border text-[10px] text-muted-foreground">
            {t("panel.traffic.avgTimeSession") || "Promedio global por sesión."}
          </div>
        </div>

        {/* Campañas de Marketing (UTMs) */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Share2 className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.traffic.campaigns") || "Campañas MKT"}</h3>
          <span className="text-xs text-muted-foreground mb-4">{t("panel.traffic.last30days") || "Últimos 30 días"}</span>
          
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[160px] pr-1 z-10">
            {data.campaigns && data.campaigns.length > 0 ? (
              data.campaigns.map((camp: any, idx: number) => (
                <div key={idx} className="flex items-start justify-between text-[11px] hover:bg-white/5 p-1 rounded-lg transition-colors gap-2">
                  <span className="text-muted-foreground break-all" title={camp.name}>{camp.name}</span>
                  <span className="font-bold text-foreground shrink-0">{camp.value} vis.</span>
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                {t("panel.traffic.noCampaigns") || "Sin campañas activas"}
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 border-t border-border text-[10px] text-muted-foreground flex items-center gap-1">
             <Activity className="size-3 text-emerald-500" /> 
             {t("panel.traffic.campaignTracking") || "Seguimiento de enlaces (UTM)"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
        {/* Chart Evolution */}
        <div className="glass rounded-3xl p-6 lg:col-span-2 flex flex-col h-full min-h-[300px]">
          <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
            <Activity className="size-5 text-indigo-500" />
            {t("panel.traffic.evolution") || "Evolución de Tráfico (30 días)"}
          </h3>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.evolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="visitas" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorVisits)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Pages & Countries */}
        <div className="flex flex-col gap-6 h-full">
          {/* Map / Countries */}
          <div className="glass rounded-3xl p-6 flex flex-col flex-1 shrink-0 overflow-hidden">
            <h3 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Globe className="size-5 text-blue-500" />
              {t("panel.traffic.topCountries") || "Top Regiones"}
            </h3>
            <div className="space-y-3 flex-1 overflow-y-auto pr-2">
              {data.topCountries && data.topCountries.length > 0 ? (
                data.topCountries.map((country: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors">
                    <span className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span className="text-lg">{country.codigo === 'ca' ? '🇨🇦' : country.codigo === 'us' ? '🇺🇸' : country.codigo === 'fr' ? '🇫🇷' : country.codigo === 'mx' ? '🇲🇽' : '🌍'}</span>
                      {country.pais}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {country.visitas} vis.
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No data.</span>
              )}
            </div>
          </div>

          <div className="glass rounded-3xl p-6 flex flex-col flex-1 shrink-0 overflow-hidden">
            <h3 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Eye className="size-5 text-emerald-500" />
              {t("panel.traffic.topPages") || "Páginas Top"}
            </h3>
            <div className="space-y-3 flex-1 overflow-y-auto pr-2">
              {data.topPages && data.topPages.length > 0 ? (
                data.topPages.map((page: any, i: number) => (
                  <div key={i} className="flex flex-col gap-1 p-3 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground truncate max-w-[200px]" title={page.url}>{page.url.replace(/^\//, '') || 'Home'}</span>
                      <span className="text-sm font-bold text-emerald-500 whitespace-nowrap">
                        {page.visitas}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No data.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
