"use client"

import { useI18n } from "@/lib/i18n"
import { RefreshCcw, TrendingUp, TrendingDown, DollarSign, Calendar, Star, ShoppingBag, Users, Plus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getDashboardCache, updateDashboardCache } from "@/lib/dashboard-cache"
import { getFinancialCustomGroups, saveFinancialCustomGroups } from "@/lib/firestore"
import { cn } from "@/lib/utils"

interface MetricBase {
  week: number; prev_week: number; weekGrowth: number;
  month: number; prev_month: number; monthGrowth: number;
  year: number; prev_year: number; yearGrowth: number;
}
interface FinancialMetrics {
  name: string;
  sales: MetricBase;
  productSales: { current: number; previous: number; monthGrowth: number };
  appointments: MetricBase;
  retentionRate: { current: number; monthGrowth: number };
  topServices: any[];
  topProducts: any[];
  barbersRetention: any[];
}
interface FinancialResponse {
  periods: { today: string; month: string; previousMonthEquivalentRange: string };
  [key: string]: any;
}

let financialMemoryCache: FinancialResponse | null = null;

export function FinancialPanel() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const [loading, setLoading] = useState(!financialMemoryCache)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<FinancialResponse | null>(financialMemoryCache)
  const [error, setError] = useState<string | null>(null)

  const [customGroups, setCustomGroups] = useState<{ name: string, members: string[] }[]>([])
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])

  useEffect(() => {
    async function loadGroups() {
      const savedLocally = localStorage.getItem('financial_custom_groups');
      if (user) {
        try {
          const remoteGroups = await getFinancialCustomGroups(user.uid);
          if (remoteGroups && remoteGroups.length > 0) {
            setCustomGroups(remoteGroups);
            localStorage.setItem('financial_custom_groups', JSON.stringify(remoteGroups));
            return;
          }
        } catch (e) {
          console.error("Error loading remote groups", e);
        }
      }
      if (savedLocally) setCustomGroups(JSON.parse(savedLocally));
    }
    loadGroups();
  }, [user]);

  const saveGroups = async (groups: any) => {
    setCustomGroups(groups)
    localStorage.setItem('financial_custom_groups', JSON.stringify(groups))
    if (user) {
      try {
        await saveFinancialCustomGroups(user.uid, groups)
      } catch (e) {
        console.error("Error saving remote groups", e)
      }
    }
  }

  const loadData = async (forceRefresh = false) => {
    if (!user) return
    setError(null)
    if (forceRefresh) setRefreshing(true)
    else if (!data) setLoading(true)

    try {
      const cached = await getDashboardCache<FinancialResponse>(user.uid, 'financial_multi')
      if (!forceRefresh && cached) {
        if (!data) setData(cached)
        financialMemoryCache = cached
        setLoading(false)
      } else if (!forceRefresh) {
        // use local storage fallback
        const loc = localStorage.getItem('financial_cache_multi')
        if (loc) {
          const parsed = JSON.parse(loc)
          if (!data) setData(parsed)
          financialMemoryCache = parsed
          setLoading(false)
        }
      }

      const token = await user.getIdToken()
      const res = await fetch(`/api/dashboard/financial${forceRefresh ? '?refresh=true' : ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())

      const freshData = await res.json()
      financialMemoryCache = freshData
      setData(freshData)
      localStorage.setItem('financial_cache_multi', JSON.stringify(freshData))
      await updateDashboardCache(user.uid, 'financial_multi', freshData)
    } catch (err: any) {
      console.error(err)
      if (!data) setError(t("panel.financial.errorLoading") || "Error al cargar datos financieros.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const formatCurrency = (val: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CAD' }).format(val)

  const GrowthBadge = ({ value, label, compact = false }: { value: number, label: string, compact?: boolean }) => (
    <div className={cn("flex flex-col items-center p-2 rounded-xl bg-muted/30 w-full", compact && "p-1")}>
      <span className="text-[8px] sm:text-[10px] text-muted-foreground mb-0.5 uppercase tracking-tighter text-center">{label}</span>
      <div className={cn("flex items-center text-[10px] sm:text-xs font-bold", value >= 0 ? "text-emerald-500" : "text-rose-500")}>
        {value >= 0 ? <TrendingUp className="size-2 sm:size-3 mr-1" /> : <TrendingDown className="size-2 sm:size-3 mr-1" />}
        {Math.abs(value).toFixed(1)}%
      </div>
    </div>
  )

  const MetricGroup = ({ label, week, month, year, weekG, monthG, yearG, isCurrency = false }: any) => (
    <div className="glass rounded-3xl p-5 sm:p-6 flex flex-col relative overflow-hidden group border-t-4 border-t-primary/20">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-bold text-foreground">{label}</h3>
        <div className="p-1.5 sm:p-2 bg-primary/10 rounded-xl">
          {isCurrency ? <DollarSign className="size-4 sm:size-5 text-primary" /> : <Calendar className="size-4 sm:size-5 text-primary" />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2">
          <div className="flex flex-row sm:flex-col justify-between items-center sm:items-start py-1 sm:py-0">
            <span className="text-[10px] sm:text-[10px] text-muted-foreground uppercase font-bold">{t("panel.financial.thisWeek") || "Semana"}</span>
            <span className="text-base sm:text-xl font-black text-foreground tabular-nums">
              {isCurrency ? formatCurrency(week).replace(".00", "") : week}
            </span>
          </div>
          <div className="flex flex-row sm:flex-col justify-between items-center sm:items-start border-y sm:border-y-0 sm:border-x border-white/5 py-2 sm:py-0 px-0 sm:px-2">
            <span className="text-[10px] sm:text-[10px] text-muted-foreground uppercase font-bold">{t("panel.financial.thisMonth") || "Mes"}</span>
            <span className="text-base sm:text-xl font-black text-foreground tabular-nums">
              {isCurrency ? formatCurrency(month).replace(".00", "") : month}
            </span>
          </div>
          <div className="flex flex-row sm:flex-col justify-between items-center sm:items-end py-1 sm:py-0">
            <span className="text-[10px] sm:text-[10px] text-muted-foreground uppercase font-bold">{t("panel.financial.thisYear") || "Año"}</span>
            <span className="text-base sm:text-xl font-black text-foreground tabular-nums">
              {isCurrency ? formatCurrency(year).replace(".00", "") : year}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 sm:pt-4 border-t border-white/5">
          <GrowthBadge value={weekG} label={t("panel.financial.vsWeek") || "vs Sem."} />
          <GrowthBadge value={monthG} label={t("panel.financial.vsMonth") || "vs Mes"} />
          <GrowthBadge value={yearG} label={t("panel.financial.vsYear") || "vs Año"} />
        </div>
      </div>
    </div>
  )

  const TrophyIcon = ({ index }: { index: number }) => {
    if (index === 0) return <div className="size-6 flex items-center justify-center rounded-full bg-cyan-400 text-white shadow-[0_0_10px_rgba(34,211,238,0.5)]">💎</div>
    if (index === 1) return <div className="size-6 flex items-center justify-center rounded-full bg-yellow-400 text-white shadow-[0_0_10px_rgba(250,204,21,0.5)]">🥇</div>
    if (index === 2) return <div className="size-6 flex items-center justify-center rounded-full bg-slate-300 text-slate-700 shadow-[0_0_10px_rgba(203,213,225,0.5)]">🥈</div>
    if (index === 3) return <div className="size-6 flex items-center justify-center rounded-full bg-amber-700 text-white shadow-[0_0_10px_rgba(180,83,9,0.5)]">🥉</div>
    return <div className="size-6 flex items-center justify-center text-xs font-bold text-muted-foreground">{index + 1}</div>
  }


  const getBranchData = (name: string): FinancialMetrics | null => {
    if (!data) return null;
    const group = customGroups.find(g => g.name === name);
    if (group) {
      // reuse activeTab logic but for specific name
      const calcG = (c: number, p: number) => p > 0 ? ((c - p) / p) * 100 : 0;
      const members = group.members.map(m => data[m] as FinancialMetrics).filter(Boolean);
      if (!members.length) return data["Todos"] as FinancialMetrics;

      const aggregateMetric = (k: 'sales' | 'appointments') => {
        const cur_w = members.reduce((sum, m) => sum + m[k].week, 0);
        const pre_w = members.reduce((sum, m) => sum + m[k].prev_week, 0);
        const cur_m = members.reduce((sum, m) => sum + m[k].month, 0);
        const pre_m = members.reduce((sum, m) => sum + m[k].prev_month, 0);
        const cur_y = members.reduce((sum, m) => sum + m[k].year, 0);
        const pre_y = members.reduce((sum, m) => sum + m[k].prev_year, 0);
        return {
          week: cur_w, prev_week: pre_w, weekGrowth: calcG(cur_w, pre_w),
          month: cur_m, prev_month: pre_m, monthGrowth: calcG(cur_m, pre_m),
          year: cur_y, prev_year: pre_y, yearGrowth: calcG(cur_y, pre_y)
        };
      };

      const cur_ps = members.reduce((sum, m) => sum + m.productSales.current, 0);
      const pre_ps = members.reduce((sum, m) => sum + m.productSales.previous, 0);

      const sMap = new Map<string, number>();
      members.forEach(m => m.topServices?.forEach(s => sMap.set(s.item_name, (sMap.get(s.item_name) || 0) + s.total_revenue)));
      const topServices = Array.from(sMap.entries()).map(([k, v]) => ({ item_name: k, total_revenue: v })).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5);

      const pMap = new Map<string, number>();
      members.forEach(m => m.topProducts?.forEach(p => pMap.set(p.item_name, (pMap.get(p.item_name) || 0) + p.total_revenue)));
      const topProducts = Array.from(pMap.entries()).map(([k, v]) => ({ item_name: k, total_revenue: v })).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5);

      const bMap = new Map<string, any>();
      members.forEach(m => m.barbersRetention.forEach(b => {
        if (!bMap.has(b.barber_name)) bMap.set(b.barber_name, { ...b });
        else {
          const eb = bMap.get(b.barber_name);
          eb.total_services += b.total_services;
          eb.unique_clients += b.unique_clients;
          if (new Date(b.start_date.value) < new Date(eb.start_date.value)) eb.start_date.value = b.start_date.value;
          eb.retention_score = eb.unique_clients > 0 ? eb.total_services / eb.unique_clients : 0;
        }
      }));
      const barbersRetention = Array.from(bMap.values()).sort((a, b) => b.retention_score - a.retention_score);
      const ts = barbersRetention.reduce((s, b) => s + b.total_services, 0);
      const uc = barbersRetention.reduce((s, b) => s + b.unique_clients, 0);

      return {
        name: group.name,
        sales: aggregateMetric('sales'),
        appointments: aggregateMetric('appointments'),
        productSales: { current: cur_ps, previous: pre_ps, monthGrowth: calcG(cur_ps, pre_ps) },
        topServices,
        topProducts,
        barbersRetention,
        retentionRate: { current: uc > 0 ? Number((ts / uc).toFixed(2)) : 0, monthGrowth: 2.1 }
      };
    }
    return data[name] as FinancialMetrics;
  }

  const BranchWindow = ({ name, isGlobal = false, isGroup = false }: { name: string, isGlobal?: boolean, isGroup?: boolean }) => {
    const branchData = getBranchData(name);
    if (!branchData) return null;

    return (
      <div id={`window-${name}`} className={cn("flex flex-col gap-6 p-4 sm:p-6 rounded-[2.5rem] border-2 transition-all duration-300",
        isGlobal ? "bg-primary/5 border-primary/20 shadow-xl shadow-primary/5" :
          isGroup ? "bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-500/5 text-foreground" :
            "bg-muted/5 border-border/50 shadow-md"
      )}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-3 rounded-2xl", isGlobal ? "bg-primary text-primary-foreground" : isGroup ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>
              {isGlobal ? <TrendingUp className="size-6" /> : isGroup ? <Users className="size-6" /> : <Plus className="size-6" />}
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight truncate max-w-[200px] sm:max-w-none">
                {isGlobal ? (t("panel.financial.global") || "Global") : name}
              </h3>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">
                {isGlobal
                  ? t("panel.financial.globalDesc") || "Consolidé de toutes les succursales"
                  : isGroup
                    ? t("panel.financial.customGroup") || "Groupe personnalisé"
                    : t("panel.financial.individualBranch") || "Succursale individuelle"
                }
              </p>
            </div>
          </div>

          {!isGlobal && !isGroup && (
            <button
              onClick={() => {
                if (!selectedBranches.includes(name)) {
                  setSelectedBranches([...selectedBranches, name]);
                  setIsCreatingGroup(true);
                  // Scroll to top of controls if needed or just show the UI
                }
              }}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm font-bold transition-all border border-foreground/5 shrink-0"
            >
              <Plus className="size-4" />
              {t("panel.financial.group") || "Agrupar"}
            </button>
          )}

          {isGroup && (
            <button
              onClick={() => {
                const newGroups = customGroups.filter(g => g.name !== name);
                saveGroups(newGroups);
              }}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-sm font-bold transition-all border border-rose-500/20 shrink-0"
            >
              <X className="size-4" />
              {t("panel.financial.removeGroup") || "Supprimer le groupe"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricGroup
            label={t("panel.financial.sales") || "Ventas de Servicios"}
            week={branchData.sales.week}
            month={branchData.sales.month}
            year={branchData.sales.year}
            weekG={branchData.sales.weekGrowth}
            monthG={branchData.sales.monthGrowth}
            yearG={branchData.sales.yearGrowth}
            isCurrency={true}
          />

          <MetricGroup
            label={t("panel.financial.appointments") || "Citas Realizadas"}
            week={branchData.appointments.week}
            month={branchData.appointments.month}
            year={branchData.appointments.year}
            weekG={branchData.appointments.weekGrowth}
            monthG={branchData.appointments.monthGrowth}
            yearG={branchData.appointments.yearGrowth}
            isCurrency={false}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShoppingBag className="size-20 text-foreground" />
            </div>
            <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.financial.productSales") || "Venta de Productos"}</h3>
            <span className="text-xs text-muted-foreground mb-4">{t("panel.financial.period") || "Periodo:"} {data?.periods?.month || "Este mes"}</span>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6 z-10">
              <span className="text-3xl sm:text-4xl font-bold text-foreground tabular-nums">
                {formatCurrency(branchData.productSales?.current || 0)}
              </span>
              <div className="pb-1">
                <GrowthBadge value={branchData.productSales?.monthGrowth || 0} label={t("panel.financial.growthVsMonth") || "vs mes anterior"} compact={true} />
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[120px]">
              {branchData.topProducts && branchData.topProducts.length > 0 ? (
                branchData.topProducts.map((product: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                    <span className="text-[10px] font-medium text-foreground truncate pr-4">{product.item_name}</span>
                    <span className="text-[10px] font-bold text-emerald-400 whitespace-nowrap tabular-nums">
                      {formatCurrency(product.total_revenue)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-[10px] text-muted-foreground opacity-50 italic">{t("panel.financial.noProducts") || "Sin ventas este mes"}</span>
              )}
            </div>
          </div>

          <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group min-h-[250px]">
            <h3 className="text-lg font-medium text-muted-foreground mb-1 flex items-center gap-2">
              <Star className="size-5 text-yellow-500" />
              {t("panel.financial.topServices") || "Servicios Top"}
            </h3>
            <span className="text-xs text-muted-foreground mb-4">{t("panel.financial.period") || "Periodo:"} {data?.periods?.month || "Este mes"}</span>
            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
              {branchData.topServices && branchData.topServices.length > 0 ? (
                branchData.topServices.map((service: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/10 hover:bg-muted/20 transition-colors">
                    <span className="text-xs font-medium text-foreground truncate pr-4">{service.item_name}</span>
                    <span className="text-xs font-bold text-emerald-500 whitespace-nowrap tabular-nums">
                      {formatCurrency(service.total_revenue)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">{t("panel.financial.noData") || "No hay datos suficientes."}</span>
              )}
            </div>
          </div>
        </div>

      </div>
    );
  };

  const availableBranches = data ? Object.keys(data as object).filter(k => k !== "periods" && k !== "Todos") : [];

  return (
    <div className="flex h-full flex-col p-4 md:p-8 md:pr-24 pb-32 md:pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto panel-stagger">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              {t("panel.financial") || "Panel Financiero"}
            </h2>
            <img src="/logos/mindbody.png" alt="Mindbody" className="size-5 sm:size-6 rounded-md opacity-90 shadow-sm" />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.financial.desc") || "Resumen de ventas y citas cruzadas"}</p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-2 rounded-full glass px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors disabled:opacity-50 text-foreground shrink-0"
        >
          <RefreshCcw className={cn("size-4", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">{t("panel.financial.update") || "Actualizar"}</span>
        </button>
      </div>

      {isCreatingGroup && (
        <div className="sticky top-0 z-50 bg-background p-6 rounded-[2rem] mb-8 animate-in fade-in slide-in-from-top-4 border-2 border-primary/40 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Users className="size-5 text-primary" />
              {t("panel.financial.newGroup") || "Crear Nuevo Grupo"}
            </h4>
            <button onClick={() => { setIsCreatingGroup(false); setSelectedBranches([]) }} className="p-2 hover:bg-foreground/10 rounded-full transition-colors">
              <X className="size-5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <input
              autoFocus
              placeholder={t("panel.financial.groupNamePlaceholder") || "Nombre del grupo (ej. Montreal)..."}
              className="bg-foreground/5 border border-foreground/10 text-lg w-full sm:flex-1 rounded-2xl py-3 px-6 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/30"
              value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
            />
            <button
              onClick={() => {
                if (newGroupName && selectedBranches.length > 0) {
                  saveGroups([...customGroups, { name: newGroupName, members: selectedBranches }])
                  setIsCreatingGroup(false)
                  setNewGroupName("")
                  setSelectedBranches([])
                }
              }}
              disabled={!newGroupName || selectedBranches.length === 0}
              className="w-full sm:w-auto text-base font-bold bg-primary text-primary-foreground px-8 py-3.5 rounded-2xl disabled:opacity-50 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {t("panel.financial.saveGroup") || "Guardar Grupo"}
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase mb-3 tracking-widest">{t("panel.financial.selectBranches") || "Sucursales seleccionadas"}:</p>
            <div className="flex flex-wrap gap-2">
              {availableBranches.map(b => (
                <button
                  key={b}
                  onClick={() => setSelectedBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm",
                    selectedBranches.includes(b) ? "bg-primary text-primary-foreground border-primary scale-105" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg shadow-primary/10" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-16">
          <section>
            <BranchWindow name="Todos" isGlobal={true} />
          </section>

          {customGroups.length > 0 && (
            <section className="flex flex-col gap-8">
              <div className="flex items-center gap-4 px-2">
                <div className="h-px flex-1 bg-border/50"></div>
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em]">{t("panel.financial.customGroups") || "Grupos Personalizados"}</span>
                <div className="h-px flex-1 bg-border/50"></div>
              </div>
              <div className="flex flex-col gap-12">
                {customGroups.map(g => (
                  <BranchWindow key={g.name} name={g.name} isGroup={true} />
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-8">
            <div className="flex items-center gap-4 px-2">
              <div className="h-px flex-1 bg-border/50"></div>
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em]">{t("panel.financial.individualBranches") || "Sucursales Individuales"}</span>
              <div className="h-px flex-1 bg-border/50"></div>
            </div>
            <div className="flex flex-col gap-12">
              {availableBranches.map(b => (
                <BranchWindow key={b} name={b} />
              ))}
            </div>
          </section>

          {/* Global Retention Ranking at the bottom */}
          {getBranchData("Todos") && (
            <section className="flex flex-col gap-8">
              <div className="flex items-center gap-4 px-2">
                <div className="h-px flex-1 bg-border/50"></div>
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em]">{t("panel.financial.globalRetention") || "Retención Global de la Red"}</span>
                <div className="h-px flex-1 bg-border/50"></div>
              </div>

              <div className="glass rounded-[3rem] p-6 sm:p-10 border-2 border-primary/20 bg-primary/[0.02] shadow-2xl relative overflow-hidden group">
                <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                  <Users className="size-80 text-foreground" />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-10">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-3">
                      <div className="p-3 bg-primary rounded-2xl shadow-lg shadow-primary/20">
                        <Users className="size-6 text-primary-foreground" />
                      </div>
                      {t("panel.financial.retention") || "Ranking de Retención"}
                    </h3>
                    <p className="text-[10px] sm:text-sm font-medium text-muted-foreground mt-2 max-w-md">
                      {t("panel.financial.activeBarbersDesc") || "Análisis detallado de la lealtad de clientes basada en servicios históricos y visitas únicas."}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 bg-background/50 backdrop-blur-md p-6 rounded-[2rem] border border-border shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{t("panel.financial.networkAverage") || "PROMEDIO RED"}</span>
                      <span className="text-4xl font-black text-primary tabular-nums">{getBranchData("Todos")?.retentionRate?.current || 0}</span>
                    </div>
                    <div className="w-px h-12 bg-border"></div>
                    <TrendingUp className="size-8 text-emerald-500 opacity-50" />
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden relative z-10 bg-background/30 rounded-[2rem] border border-border/50">
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 px-6 py-4 text-[10px] font-black uppercase text-muted-foreground border-b border-border/50 bg-muted/10">
                    <div className="col-span-2">{t("panel.financial.barber") || "Barbero"}</div>
                    <div className="hidden sm:block text-center">{t("panel.financial.totalServices") || "Servicios"}</div>
                    <div className="text-center">{t("panel.financial.uniqueClients") || "Clientes"}</div>
                    <div className="text-right">{t("panel.financial.score") || "Score"}</div>
                  </div>
                  <div className="flex flex-col gap-1 p-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {getBranchData("Todos")?.barbersRetention?.map((barber: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-4 sm:grid-cols-5 gap-4 items-center p-4 rounded-2xl hover:bg-muted/30 transition-all group/item border border-transparent hover:border-primary/5">
                        <div className="col-span-2 flex items-center gap-4">
                          <TrophyIcon index={idx} />
                          <div className="flex flex-col truncate">
                            <span className="text-sm sm:text-base font-bold text-foreground truncate group-hover/item:text-primary transition-colors">{barber.barber_name}</span>
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase flex items-center gap-1 font-bold">
                              <Calendar className="size-3" />
                              {new Date(barber.start_date.value).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <div className="hidden sm:block text-center text-sm font-medium tabular-nums text-foreground/70">{barber.total_services}</div>
                        <div className="text-center text-sm font-medium tabular-nums text-foreground/70">{barber.unique_clients}</div>
                        <div className="text-right">
                          <span className={cn(
                            "px-4 py-2 rounded-xl text-xs sm:text-sm font-black tabular-nums shadow-sm flex items-center justify-center ml-auto w-fit min-w-[60px] sm:min-w-[80px]",
                            idx === 0 ? "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20" :
                              idx === 1 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                                idx === 2 ? "bg-slate-300/10 text-slate-300 border border-slate-300/20" :
                                  "bg-primary/10 text-primary border border-primary/20"
                          )}>
                            {barber.retention_score.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  )
}
