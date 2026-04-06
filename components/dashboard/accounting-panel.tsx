"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { RefreshCcw, Wallet, Receipt, Gavel, Percent, ArrowUpRight, ArrowDownRight, TrendingUp, PieChart as PieChartIcon } from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(val)
}

let accountingCache: any = null

export function AccountingPanel() {
  const { t } = useI18n()
  const [data, setData] = useState<any>(accountingCache)
  const [loading, setLoading] = useState(!accountingCache)
  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // Load from Cache on first mount if no memory cache
  useEffect(() => {
    if (!accountingCache) {
      const cached = localStorage.getItem('accounting_cache')
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          accountingCache = parsed
          setData(parsed)
          setLoading(false)
        } catch (e) {
          console.error("Error parsing accounting cache", e)
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

      const res = await fetch(`/api/dashboard/accounting${isRefetch ? '?refresh=true' : ''}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())
      const freshData = await res.json()
      accountingCache = freshData
      setData(freshData)
      localStorage.setItem('accounting_cache', JSON.stringify(freshData))
    } catch (e: any) {
      console.error("Error loading accounting data", e)
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
          <p className="text-muted-foreground animate-pulse text-sm">{t("loading.accounting")}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-32 md:pb-6 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 panel-stagger">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            {t("panel.accounting") || "Gestión Contable"}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.accounting.desc") || "Estado financiero y obligaciones fiscales"}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 shrink-0">
        {/* Net Profit */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group border-emerald-500/20">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet className="size-24 text-emerald-500" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.accounting.netProfit") || "Beneficio Neto"}</h3>
          <span className="text-xs text-muted-foreground mb-4">Post-impuestos y gastos</span>
          <span className="text-4xl font-bold text-emerald-500 mb-6 z-10 tabular-nums">{formatCurrency(data.summary.netProfit)}</span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.profitGrowth} label="vs Mes anterior" />
          </div>
        </div>

        {/* Total Income */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.accounting.income") || "Ingresos Totales"}</h3>
          <span className="text-xs text-muted-foreground mb-4">Bruto acumulado</span>
          <span className="text-3xl font-bold text-foreground mb-6 z-10">{formatCurrency(data.summary.totalIncome)}</span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.incomeGrowth} label="Tendencia ventas" />
          </div>
        </div>

        {/* Total Expenses */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Receipt className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.accounting.expenses") || "Gastos Totales"}</h3>
          <span className="text-xs text-muted-foreground mb-4">Costos operativos</span>
          <span className="text-3xl font-bold text-foreground mb-6 z-10 text-rose-500/80">{formatCurrency(data.summary.totalExpenses)}</span>
          <div className="mt-auto pt-4 border-t border-border">
            <GrowthBadge value={data.summary.expenseGrowth} label="Control de costos" />
          </div>
        </div>

        {/* Profit Margin */}
        <div className="glass rounded-3xl p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Percent className="size-24 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">{t("panel.accounting.margin") || "Margen"}</h3>
          <span className="text-xs text-muted-foreground mb-4">Rentabilidad neta</span>
          <span className="text-5xl font-bold text-foreground mb-6 z-10">{data.summary.margin}%</span>
          <div className="mt-auto pt-4 border-t border-border flex items-center gap-2">
            <Gavel className="size-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">IVA estimado: {formatCurrency(data.summary.taxes)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
        {/* Expense Breakdown */}
        <div className="glass rounded-3xl p-6 flex flex-col h-full overflow-hidden">
          <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
            <PieChartIcon className="size-5 text-primary" />
            Desglose de Egresos
          </h3>
          <div className="flex-1 w-full relative min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.expenseBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.expenseBreakdown.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash Flow Evolution Chart */}
        <div className="glass rounded-3xl p-6 flex flex-col h-full overflow-hidden">
          <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
            <TrendingUp className="size-5 text-emerald-500" />
            Flujo de Caja (Income vs Expenses)
          </h3>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyFlow} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '11px' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend iconType="rect" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Gastos" fill="#ef4444" opacity={0.7} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
