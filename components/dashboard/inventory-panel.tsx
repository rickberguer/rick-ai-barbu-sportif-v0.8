"use client"

import { useI18n } from "@/lib/i18n"
import { RefreshCw, Package, Search, ChevronRight, Layers, DollarSign, Store, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getDashboardCache, updateDashboardCache } from "@/lib/dashboard-cache"
import { cn, formatCurrency } from "@/lib/utils"

interface InventoryProduct {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_line_value: number;
  product_image?: string | null;
  min_threshold?: number;
}

interface BranchInventory {
  totalValue: number;
  totalItems: number;
  products: InventoryProduct[];
}

interface InventoryResponse {
  branches: Record<string, BranchInventory>;
}

let inventoryMemoryCache: InventoryResponse | null = null;

export function InventoryPanel() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [loading, setLoading] = useState(!inventoryMemoryCache)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<InventoryResponse | null>(inventoryMemoryCache)
  const [error, setError] = useState<string | null>(null)
  
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null)

  const loadData = async (forceRefresh = false) => {
    if (!user) return
    setError(null)
    if (forceRefresh) setRefreshing(true)
    else if (!data) setLoading(true)

    try {
      const cached = await getDashboardCache<InventoryResponse>(user.uid, 'inventory_multi')
      if (!forceRefresh && cached) {
        if (!data) setData(cached)
        inventoryMemoryCache = cached
        setLoading(false)
      }

      const token = await user.getIdToken()
      const res = await fetch(`/api/dashboard/inventory${forceRefresh ? '?refresh=true' : ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())

      const freshData = await res.json()
      inventoryMemoryCache = freshData
      setData(freshData)
      await updateDashboardCache(user.uid, 'inventory_multi', freshData)
    } catch (err: any) {
      console.error(err)
      if (!data) setError("Error al cargar datos de inventario.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col p-4 md:pl-8 md:pt-8 pr-4 md:pr-24 pb-32 animate-in fade-in duration-500 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Package className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t("panel.inventory")}</h1>
            <p className="text-muted-foreground text-sm font-medium">{t("panel.inventory.desc")}</p>
          </div>
        </div>
        
        <button 
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="p-2.5 rounded-xl hover:bg-muted/50 transition-colors border border-border/50"
          title={t("panel.financial.update")}
        >
          <RefreshCw className={cn("size-5", refreshing && "animate-spin")} />
        </button>
      </div>

      {data.branches["Todos"] && (
        <div className="flex flex-wrap gap-3 mb-8">
          <div className="p-1 px-2.5 rounded-lg bg-primary/5 border border-primary/10 flex items-center gap-3">
            <div className="flex items-center gap-1.5 border-r border-primary/20 pr-3">
              <DollarSign className="size-3 text-primary" />
              <span className="text-[10px] font-black tracking-wider text-primary uppercase">{t("panel.inventory.totalValue")}</span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-black tabular-nums">{formatCurrency(data.branches["Todos"].totalValue)}</span>
              <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
          </div>
          
          <div className="p-1 px-2.5 rounded-lg bg-secondary/5 border border-secondary/10 flex items-center gap-3">
            <div className="flex items-center gap-1.5 border-r border-secondary/20 pr-3">
              <Package className="size-3 text-secondary" />
              <span className="text-[10px] font-black tracking-wider text-secondary uppercase">{t("panel.inventory.totalItems")}</span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-black tabular-nums">{data.branches["Todos"].totalItems}</span>
              <div className="size-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="p-2 bg-primary/5 rounded-lg">
              <Layers className="size-4 text-primary" />
            </div>
            <h2 className="text-lg font-bold">{t("panel.inventory.global")}</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent ml-2" />
          </div>

          <div className="bg-card/30 backdrop-blur-md rounded-3xl border border-border/50 overflow-hidden">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4 px-6 py-4 bg-muted/20 border-b border-border/50 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
              <div className="col-span-2 sm:col-span-3">{t("panel.inventory.product")}</div>
              <div className="text-center">{t("panel.inventory.quantity")}</div>
              <div className="hidden sm:block text-right">{t("panel.inventory.price")}</div>
              <div className="text-right">{t("panel.inventory.value")}</div>
            </div>
            
            <div className="divide-y divide-border/30 max-h-[600px] overflow-y-auto custom-scrollbar p-2">
              {data.branches["Todos"]?.products.map((p, idx) => {
                const isLowStock = p.min_threshold !== undefined && p.quantity < p.min_threshold;
                return (
                  <div key={idx} className="grid grid-cols-4 sm:grid-cols-6 gap-4 px-4 py-3 items-center rounded-2xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50">
                    <div className="col-span-2 sm:col-span-3 flex shadow-sm items-center gap-3">
                      <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative">
                        {p.product_image ? (
                          <img src={p.product_image} alt={p.product_name} className="object-contain w-full h-full p-1 drop-shadow-md mix-blend-multiply dark:mix-blend-normal" />
                        ) : (
                          <Layers className="size-4 text-primary" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold truncate text-foreground/90 leading-none mb-1">{p.product_name}</span>
                        {isLowStock && (
                          <span className="text-[9px] font-black uppercase text-red-500 tracking-tighter flex items-center gap-1">
                            <AlertTriangle className="size-2" /> {t("panel.inventory.lowStock")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      <span className={`text-sm font-black tabular-nums py-1 px-2 rounded-full ${isLowStock ? "bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "text-foreground/80"}`}>
                        {p.quantity}
                      </span>
                    </div>
                    <div className="hidden sm:block text-right text-xs font-bold tabular-nums text-muted-foreground/60">{formatCurrency(p.unit_price)}</div>
                    <div className="text-right text-sm font-black tabular-nums text-emerald-500">{formatCurrency(p.total_line_value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="p-2 bg-secondary/5 rounded-lg">
              <Store className="size-4 text-secondary" />
            </div>
            <h2 className="text-lg font-bold">{t("panel.inventory.branches")}</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent ml-2" />
          </div>

          <div className="space-y-3">
            {Object.entries(data.branches)
              .filter(([name]) => name !== "Todos")
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, branch]) => {
                const hasLowStock = branch.products.some(p => p.min_threshold !== undefined && p.quantity < p.min_threshold);
                return (
                  <div key={name} className="group">
                    <button 
                      onClick={() => setExpandedBranch(expandedBranch === name ? null : name)}
                      className={`w-full text-left p-4 rounded-3xl border transition-all duration-300 backdrop-blur-sm shadow-sm ${
                        expandedBranch === name 
                        ? 'bg-muted/40 border-primary/30 ring-1 ring-primary/20 scale-[1.01]' 
                        : 'bg-card/40 border-border/50 hover:border-border hover:bg-muted/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-2xl transition-colors ${expandedBranch === name ? 'bg-primary/20' : 'bg-muted/40'}`}>
                            <Store className={`size-5 ${expandedBranch === name ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-lg group-hover:text-primary transition-colors">{name}</span>
                              {hasLowStock && (
                                <div className="p-1 px-2 rounded-full bg-red-500/10 border border-red-500/20">
                                  <AlertTriangle className="size-3 text-red-500" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 underline-offset-4 decoration-primary/30 decoration-2">
                              <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">{branch.totalItems} {t("panel.inventory.quantity")}</span>
                              <div className="size-1 rounded-full bg-border" />
                              <span className="text-xs font-black text-emerald-500 tracking-wider bg-emerald-500/5 px-2 py-0.5 rounded-full">{formatCurrency(branch.totalValue)}</span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className={`size-5 text-muted-foreground transition-transform duration-500 ${expandedBranch === name ? 'rotate-90 text-primary' : ''}`} />
                      </div>

                      {expandedBranch === name && (
                        <div className="mt-6 pt-4 border-t border-border/30 animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 px-4 py-2 text-[9px] font-black tracking-widest text-muted-foreground uppercase mb-2">
                            <span className="col-span-2">{t("panel.inventory.product")}</span>
                            <span className="text-center">{t("panel.inventory.quantity")}</span>
                            <span className="hidden sm:block text-right">{t("panel.inventory.price")}</span>
                            <span className="text-right">{t("panel.inventory.value")}</span>
                          </div>
                          <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                            {branch.products.sort((a,b) => b.total_line_value - a.total_line_value).map((p, i) => {
                              const isProdLow = p.min_threshold !== undefined && p.quantity < p.min_threshold;
                              return (
                                <div key={i} className="grid grid-cols-3 sm:grid-cols-5 gap-4 px-4 py-2.5 items-center rounded-xl bg-background/30 hover:bg-muted/50 transition-colors">
                                  <span className={`col-span-2 text-xs font-bold truncate pr-2 flex items-center gap-2 ${isProdLow ? "text-red-500" : "text-foreground/90"}`}>
                                    {p.product_image && (
                                      <div className="size-6 shrink-0 bg-white/5 rounded flex bg-muted/20 items-center justify-center overflow-hidden">
                                        <img src={p.product_image} alt="" className="object-contain w-full h-full p-0.5 mix-blend-multiply dark:mix-blend-normal" />
                                      </div>
                                    )}
                                    {p.product_name}
                                  </span>
                                  <span className={`text-center text-xs font-black tabular-nums py-0.5 rounded-full ${isProdLow ? "bg-red-500/10 text-red-500 border border-red-500/10" : "text-foreground/80"}`}>
                                    {p.quantity}
                                  </span>
                                  <span className="hidden sm:block text-right text-[11px] font-medium tabular-nums text-muted-foreground">{formatCurrency(p.unit_price)}</span>
                                  <span className="text-right text-xs font-black tabular-nums text-emerald-500">{formatCurrency(p.total_line_value)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
        </section>
      </div>
    </div>
  )
}
