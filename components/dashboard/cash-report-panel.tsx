"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { RefreshCcw, Landmark, TrendingUp, Calendar, Store, AlertCircle } from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function CashReportPanel() {
  const { t } = useI18n()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const parseCurrency = (val: any) => {
    if (!val) return 0;
    let s = val.toString().trim();
    if (s.includes(",") && !s.includes(".")) {
      s = s.replace(",", ".");
    }
    return parseFloat(s.replace(/[^0-9.-]+/g, "")) || 0;
  };

  const loadData = async (isRefetch = false) => {
    try {
      if (isRefetch) setRefreshing(true)
      else setLoading(true)

      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("No token")

      const res = await fetch(`/api/dashboard/cash-report?date=${selectedDate}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())
      const freshData = await res.json()
      setData(freshData)
    } catch (e) {
      console.error("Error loading cash report data", e)
      toast.error(t("panel.financial.errorLoading") || "Error loading cash report")
    } finally {
      if (isRefetch) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedDate])

  const handleWithdraw = async (shopName: string, accumulated: number) => {
    if (!accumulated || accumulated <= 0) {
      toast.error("No hay saldo acumulado para retirar");
      return;
    }

    const confirm = window.confirm(`¿Seguro que deseas vaciar el acumulado de ${shopName}? (${formatCurrency(accumulated)})`);
    if (!confirm) return;

    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("No token")

      const res = await fetch("/api/dashboard/cash-report/withdraw", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ shop: shopName })
      })

      const resText = await res.text();
      if (!res.ok) throw new Error(resText)
      
      toast.success("Retiro completado satisfactoriamente")
      loadData(true) // recargar datos
    } catch (e: any) {
      console.error(e)
      toast.error(`Error al procesar el retiro: ${e.message}`)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse text-sm">{t("loading.cashReport")}</p>
        </div>
      </div>
    )
  }

  // Calculate totals
  const totals = data.reduce((acc, shop) => {
    return {
      auto: acc.auto + parseCurrency(shop.depotAuto),
      reel: acc.reel + parseCurrency(shop.depotReel),
      short: acc.short + parseCurrency(shop.shortOver),
      accumulated: acc.accumulated + (shop.accumulated || 0)
    };
  }, { auto: 0, reel: 0, short: 0, accumulated: 0 });

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-32 md:pb-6 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 panel-stagger">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            {t("panel.cashReport") || "Reporte de Cajas"}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.cashReport.desc") || "Monitorea los cierres de caja diarios"}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-muted/20 border border-border/50 rounded-2xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground appearance-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 rounded-2xl glass px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors disabled:opacity-50 text-foreground"
          >
            <RefreshCcw className={cn("size-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">{t("panel.financial.update") || "Actualizar"}</span>
          </button>
        </div>
      </div>

      {/* Daily Summary */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-in zoom-in-95 duration-500">
          <div className="glass rounded-3xl p-6 border-l-4 border-l-emerald-500 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Depot Auto</p>
              <h3 className="text-2xl font-black text-emerald-500">{formatCurrency(totals.auto)}</h3>
            </div>
            <div className="size-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <TrendingUp className="size-6" />
            </div>
          </div>
          <div className="glass rounded-3xl p-6 border-l-4 border-l-blue-500 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Depot Reel</p>
              <h3 className="text-2xl font-black text-blue-500">{formatCurrency(totals.reel)}</h3>
            </div>
            <div className="size-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Landmark className="size-6" />
            </div>
          </div>
          <div className={cn(
            "glass rounded-3xl p-6 border-l-4 flex items-center justify-between shadow-lg",
            totals.short < 0 ? "border-l-rose-500" : totals.short === 0 ? "border-l-emerald-500" : "border-l-blue-500"
          )}>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Short / Over</p>
              <h3 className={cn(
                "text-2xl font-black",
                totals.short < 0 ? "text-rose-500" : totals.short === 0 ? "text-emerald-500" : "text-blue-500"
              )}>{formatCurrency(totals.short)}</h3>
            </div>
            <div className={cn(
              "size-12 rounded-2xl flex items-center justify-center",
              totals.short < 0 ? "bg-rose-500/10 text-rose-500" : totals.short === 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
            )}>
              <div className="font-bold text-xl">±</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {data.map((shop, i) => {
          const shortVal = parseCurrency(shop.shortOver);

          let statusColor = "primary";
          let bgColor = "hover:bg-muted/5";
          let borderColor = "border-border/50";

          if (shortVal < 0) {
            statusColor = "rose-500";
            bgColor = "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]";
            borderColor = "border-rose-500/30 hover:border-rose-500/50";
          } else if (shortVal === 0) {
            statusColor = "emerald-500";
            bgColor = "bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06]";
            borderColor = "border-emerald-500/30 hover:border-emerald-500/50";
          } else {
            statusColor = "blue-500";
            bgColor = "bg-blue-500/[0.03] hover:bg-blue-500/[0.06]";
            borderColor = "border-blue-500/30 hover:border-blue-500/50";
          }

          return (
            <div key={i} className={cn(
              "group relative glass rounded-[2rem] p-6 transition-all duration-300 border shadow-xl shadow-transparent hover:shadow-lg",
              bgColor, borderColor
            )}>
              <div className="flex items-center gap-4 mb-6">
                <div className={cn(
                  "size-12 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110",
                  `bg-${statusColor}/10 text-${statusColor}`
                )}>
                  <Store className="size-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-lg truncate">{shop.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <Calendar className="size-3" />
                    {shop.date}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-background/40 border border-border/20">
                  <span className="text-xs font-medium text-muted-foreground">Depot Auto</span>
                  <span className="text-sm font-bold text-emerald-500">{shop.depotAuto}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-background/40 border border-border/20">
                  <span className="text-xs font-medium text-muted-foreground">Depot Reel</span>
                  <span className="text-sm font-bold text-blue-500">{shop.depotReel}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-background/40 border border-border/20 border-l-2 border-l-amber-500">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="size-3 text-amber-500" /> {t("panel.cashReport.accumulated") || "Acumulado"}
                  </span>
                  <span className="text-sm font-black text-amber-500">{formatCurrency(shop.accumulated || 0)}</span>
                </div>

                <div className={cn(
                  "flex items-center justify-between p-3 rounded-2xl border",
                  shortVal < 0 ? "bg-rose-500/5 border-rose-500/10" : shortVal === 0 ? "bg-emerald-500/5 border-emerald-500/10" : "bg-blue-500/5 border-blue-500/10"
                )}>
                  <span className="text-xs font-bold uppercase tracking-tight opacity-70">Short / Over</span>
                  <span className={cn("text-sm font-black", `text-${statusColor}`)}>{shop.shortOver}</span>
                </div>

                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleWithdraw(shop.name, shop.accumulated);
                  }}
                  disabled={!shop.accumulated || shop.accumulated <= 0}
                  className="w-full mt-2 flex items-center justify-center gap-2 rounded-2xl py-2.5 px-4 text-xs font-black transition-all border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                >
                  {t("panel.cashReport.withdraw") || "Retiro"}
                </button>
              </div>

              {/* Decorative background element */}
              <div className={cn(
                "absolute -bottom-2 -right-2 size-24 blur-3xl rounded-full opacity-0 group-hover:opacity-10 transition-opacity",
                `bg-${statusColor}`
              )} />
            </div>
          );
        })}
      </div>
      {data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <AlertCircle className="size-12 mb-4 opacity-20" />
          <p>{t("panel.financial.noData") || "No hay datos disponibles."}</p>
        </div>
      )}
    </div>
  )
}
