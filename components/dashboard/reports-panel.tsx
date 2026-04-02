"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import {
  RefreshCcw, FileText, Download, Search, Filter,
  FileSpreadsheet, FileBox, Clock, Grid, List,
  MoreVertical, Trash, Mail, Info, Archive,
  CheckSquare, Square, ChevronRight, X, ExternalLink, Plus
} from "lucide-react"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

type ViewMode = "list" | "grid"

let reportsCache: any[] | null = null

export function ReportsPanel() {
  const { t } = useI18n()
  const [data, setData] = useState<any[]>(reportsCache || [])
  const [loading, setLoading] = useState(!reportsCache)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingFile, setEditingFile] = useState<{ id: string, name: string } | null>(null)

  const loadData = async (isRefetch = false) => {
    try {
      if (isRefetch) setRefreshing(true)
      else if (!data.length && !reportsCache) setLoading(true)

      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("No token")

      const res = await fetch("/api/dashboard/reports", {
        headers: { "Authorization": `Bearer ${token}` }
      })

      if (!res.ok) throw new Error(await res.text())
      const freshData = await res.json()
      reportsCache = freshData
      setData(freshData)
    } catch (e) {
      console.error("Error loading reports data", e)
      toast.error(t("panel.financial.errorLoading") || "Error loading reports")
    } finally {
      if (isRefetch) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredReports = data.filter(rep =>
    rep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rep.format.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredReports.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredReports.map(r => r.id)))
    }
  }

  const handleDelete = async (ids: string[]) => {
    if (!confirm(t("settings.deleteConfirmTitle") || "¿Eliminar seleccionados?")) return

    const deletePromise = async () => {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch("/api/dashboard/reports", {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || "Delete failed")
      }

      setData(prev => prev.filter(f => !ids.includes(f.id)))
      setSelectedIds(new Set())
      return true
    }

    toast.promise(deletePromise(), {
      loading: t("panel.reports.deleting") || "Eliminando de Drive...",
      success: t("panel.reports.deleteSuccess") || "Archivos eliminados correctamente",
      error: (err) => `Error: ${err.message}`
    })
  }

  const handleRename = async () => {
    if (!editingFile) return
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch("/api/dashboard/reports", {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: editingFile.id, name: editingFile.name })
      })
      if (!res.ok) throw new Error("Rename failed")

      setData(prev => prev.map(f => f.id === editingFile.id ? { ...f, name: editingFile.name } : f))
      setEditingFile(null)
      toast.success(t("panel.reports.rename") || "Renombrado con éxito")
    } catch (e) {
      toast.error("Error renaming file")
    }
  }

  const handleBulkDownload = () => {
    toast.info(t("panel.reports.bulkDownload") || "Preparando descarga ZIP...")
    // In a real app, this would call an API to generate a ZIP
  }

  const handleEmail = (ids: string[]) => {
    toast.info(t("panel.reports.email") || "Preparando envío por e-mail...")
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse text-sm">{t("loading.reports")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-6 md:pr-24 pb-32 md:pb-6 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            {t("panel.reports")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("panel.reports.desc")}</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-4">
              <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                {t("panel.reports.selection").replace("{count}", selectedIds.size.toString())}
              </span>
              <button onClick={() => handleDelete(Array.from(selectedIds))} className="p-2 glass rounded-full text-rose-500 hover:bg-rose-500/10 transition-colors">
                <Trash className="size-4" />
              </button>
              <button onClick={handleBulkDownload} className="p-2 glass rounded-full text-foreground hover:bg-muted/20 transition-colors">
                <Archive className="size-4" />
              </button>
              <button onClick={() => handleEmail(Array.from(selectedIds))} className="p-2 glass rounded-full text-foreground hover:bg-muted/20 transition-colors">
                <Mail className="size-4" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
            </div>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 rounded-full glass px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors disabled:opacity-50 text-foreground"
          >
            <RefreshCcw className={cn("size-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">{t("panel.financial.update")}</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-6 shrink-0">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={t("panel.reports.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted/20 border border-border/50 rounded-2xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted/20 rounded-xl border border-border/50">
          <button
            onClick={() => setViewMode("list")}
            className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <List className="size-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn("p-1.5 rounded-lg transition-all", viewMode === 'grid' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <Grid className="size-4" />
          </button>
        </div>

        <button className="glass p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors">
          <Filter className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin rounded-3xl border border-border/50 glass">
        {viewMode === "list" ? (
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50">
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-3 px-6 w-10">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-primary transition-colors">
                    {selectedIds.size === filteredReports.length && filteredReports.length > 0 ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                  </button>
                </th>
                <th className="py-3 px-4">{t("panel.reports.history")}</th>
                <th className="py-3 px-4 hidden md:table-cell">{t("panel.reports.date")}</th>
                <th className="py-4 px-4 hidden sm:table-cell">{t("panel.reports.size")}</th>
                <th className="py-4 pr-6 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredReports.map((rep) => (
                <FileRow
                  key={rep.id}
                  file={rep}
                  isSelected={selectedIds.has(rep.id)}
                  onSelect={() => toggleSelect(rep.id)}
                  onDelete={() => handleDelete([rep.id])}
                  onRename={() => setEditingFile({ id: rep.id, name: rep.name })}
                  onEmail={() => handleEmail([rep.id])}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {filteredReports.map((rep) => (
              <FileCard
                key={rep.id}
                file={rep}
                isSelected={selectedIds.has(rep.id)}
                onSelect={() => toggleSelect(rep.id)}
                onDelete={() => handleDelete([rep.id])}
                onRename={() => setEditingFile({ id: rep.id, name: rep.name })}
                onEmail={() => handleEmail([rep.id])}
                t={t}
              />
            ))}
          </div>
        )}

        {filteredReports.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95">
            <div className="size-20 bg-muted/20 rounded-full flex items-center justify-center mb-6">
              <FileBox className="size-10 opacity-20" />
            </div>
            <p className="text-sm font-medium">{t("panel.reports.noResults")}</p>
          </div>
        )}
      </div>

      {/* Rename Dialog MockUp */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-border/50 animate-in zoom-in-95">
            <h3 className="text-lg font-bold mb-4">{t("panel.reports.rename")}</h3>
            <input
              type="text"
              value={editingFile.name}
              onChange={(e) => setEditingFile({ ...editingFile, name: e.target.value })}
              className="w-full bg-muted/20 border border-border/50 rounded-xl py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mb-6"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditingFile(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("loading.retry") || "Cancelar"}
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-all"
              >
                {t("panel.reports.rename")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileRow({ file, isSelected, onSelect, onDelete, onRename, onEmail, t }: any) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr className={cn(
          "group/row transition-all duration-200 cursor-pointer",
          isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/10"
        )} onClick={onSelect}>
          <td className="py-4 px-6">
            <button className={cn(
              "p-0.5 rounded transition-colors",
              isSelected ? "text-primary" : "text-muted-foreground/30 group-hover/row:text-muted-foreground"
            )}>
              {isSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
            </button>
          </td>
          <td className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "size-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                file.format === 'PDF' ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
              )}>
                {file.format === 'PDF' ? <FileText className="size-5" /> : <FileSpreadsheet className="size-5" />}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground block truncate max-w-[200px] lg:max-w-md">{file.name}</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono tracking-tight">{file.format} • {file.size}</span>
              </div>
            </div>
          </td>
          <td className="py-4 px-4 hidden md:table-cell">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3 opacity-60" />
              {file.date}
            </div>
          </td>
          <td className="py-4 px-4 hidden sm:table-cell">
            <span className="text-[10px] uppercase font-bold text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded-full">
              {file.size}
            </span>
          </td>
          <td className="py-4 pr-6 text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); window.open(file.url, '_blank') }}
                className="p-2 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="size-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="p-2 hover:bg-muted/50 rounded-lg text-muted-foreground transition-colors">
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 glass border-border/50">
                  <DropdownMenuItem onClick={onRename} className="gap-2">
                    <Plus className="size-4 rotate-45" /> {t("panel.reports.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.open(file.url, '_blank')} className="gap-2">
                    <Download className="size-4" /> {t("panel.reports.download")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEmail} className="gap-2">
                    <Mail className="size-4" /> {t("panel.reports.email")}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 text-muted-foreground">
                    <Info className="size-4" /> {t("panel.reports.info")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDelete} className="gap-2 text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                    <Trash className="size-4" /> {t("panel.reports.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </td>
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 glass border-border/50 shadow-2xl">
        <ContextMenuItem onClick={() => window.open(file.url, '_blank')} className="gap-2">
          <ExternalLink className="size-4" /> {t("panel.reports.download")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onRename} className="gap-2">
          <Plus className="size-4 rotate-45" /> {t("panel.reports.rename")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onEmail} className="gap-2">
          <Mail className="size-4" /> {t("panel.reports.email")}
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-border/30" />
        <ContextMenuItem onClick={onDelete} className="gap-2 text-rose-500">
          <Trash className="size-4" /> {t("panel.reports.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FileCard({ file, isSelected, onSelect, onDelete, onRename, onEmail, t }: any) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onSelect}
          className={cn(
            "group relative flex flex-col items-center p-4 rounded-3xl border transition-all duration-300 cursor-pointer",
            isSelected ? "bg-primary/5 border-primary shadow-lg shadow-primary/5 scale-[1.02]" : "bg-muted/10 border-transparent hover:bg-muted/20 hover:border-border/50"
          )}
        >
          {/* Checkbox overlay */}
          <div className={cn(
            "absolute top-3 left-3 size-5 rounded-full flex items-center justify-center transition-all",
            isSelected ? "bg-primary text-primary-foreground scale-110" : "bg-background/80 text-transparent opacity-0 group-hover:opacity-100"
          )}>
            <CheckSquare className="size-3" />
          </div>

          {/* More options button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 rounded-lg hover:bg-muted/50 transition-all">
                <MoreVertical className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 glass border-border/50">
              <DropdownMenuItem onClick={onRename} className="gap-2">
                <Plus className="size-4 rotate-45" /> {t("panel.reports.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(file.url, '_blank')} className="gap-2">
                <Download className="size-4" /> {t("panel.reports.download")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="gap-2 text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                <Trash className="size-4" /> {t("panel.reports.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Icon/Thumbnail */}
          <div className={cn(
            "size-20 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-300",
            file.format === 'PDF' ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
          )}>
            {file.format === 'PDF' ? <FileText className="size-10" /> : <FileSpreadsheet className="size-10" />}
          </div>

          <span className="text-sm font-medium text-center truncate w-full px-2" title={file.name}>
            {file.name}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tight">
            {file.format} • {file.size}
          </span>

          {/* Hover Action Overlay */}
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-5 transition-opacity rounded-3xl" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 glass border-border/50">
        <ContextMenuItem onClick={() => window.open(file.url, '_blank')} className="gap-2">
          <Download className="size-4" /> {t("panel.reports.download")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onRename} className="gap-2">
          <Plus className="size-4 rotate-45" /> {t("panel.reports.rename")}
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-border/30" />
        <ContextMenuItem onClick={onDelete} className="gap-2 text-rose-500">
          <Trash className="size-4" /> {t("panel.reports.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
