"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Camera, RefreshCw, Maximize2, Expand, WifiOff,
  Bell, BellRing, X, Download,
  Users, Scissors, LayoutGrid,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import LiveVisionCamera from "./live-vision-camera"

// =========================================================================
// TIPOS
// =========================================================================
interface VisionData {
  people: Array<{ type: 'barber' | 'client', box_2d: [number, number, number, number] }>
  chairs: Array<{ status: 'occupied' | 'empty', box_2d: [number, number, number, number] }>
  summary: { total_barbers: number; total_clients: number; occupied_chairs: number }
}

// Estadísticas agregadas que envía el GPU (main.py _compute_stats)
interface VisionStats {
  barbers_present:  number
  barbers_working:  number
  barbers_idle:     number
  clients_in_chair: number
  clients_waiting:  number
  chairs_total:     number
  chairs_occupied:  number
  chairs_empty:     number
  alerts:           string[]
}

const EMPTY_STATS: VisionStats = {
  barbers_present: 0, barbers_working: 0, barbers_idle: 0,
  clients_in_chair: 0, clients_waiting: 0,
  chairs_total: 0, chairs_occupied: 0, chairs_empty: 0,
  alerts: [],
}

interface CameraState {
  detections: any[]
  data: VisionData
  stats: VisionStats
  lastUpdate: Date
}

interface VisionAlert {
  id: string
  cameraId: string   // GPU camera ID
  cameraLabel: string
  label: string
  timestamp: Date
}

// =========================================================================
// CONSTANTES
// =========================================================================
const BRANCH_TO_CAMERA: Record<string, string> = {
  ndp: 'ndp_stations',
  ndp2: 'ndp_stations2',
  francois1: 'francois1',
  francois2: 'francois2',
}

const BRANCHES = [
  {
    id: 'ndp',
    name: 'Notre-Dame-des-Prairies',
    cameras: [
      { id: 'ndp',  label: 'Principal', rotation: 0 as 0 | -90 },
      { id: 'ndp2', label: 'Vista 2',   rotation: 0 as 0 | -90 },
    ],
  },
  {
    id: 'mirabel',
    name: 'Mirabel',
    cameras: [
      { id: 'mirabel1', label: 'Cámara 1', rotation: 0 as 0 | -90 },
      { id: 'mirabel2', label: 'Cámara 2', rotation: 0 as 0 | -90 },
      { id: 'mirabel3', label: 'Cámara 3', rotation: 0 as 0 | -90 },
      { id: 'mirabel4', label: 'Cámara 4', rotation: 0 as 0 | -90 },
      { id: 'mirabel5', label: 'Cámara 5', rotation: 0 as 0 | -90 },
    ],
  },
  {
    id: 'francois',
    name: 'Francois',
    cameras: [
      { id: 'francois1', label: 'Cámara 1', rotation: 0 as 0 | -90 },
      { id: 'francois2', label: 'Cámara 2', rotation: 0 as 0 | -90 },
    ],
  },
]

// Mapa GPU ID → etiqueta legible (para alertas y logs)
const CAMERA_TO_LABEL: Record<string, string> = {}
for (const branch of BRANCHES) {
  for (const cam of branch.cameras) {
    const gpuId = BRANCH_TO_CAMERA[cam.id] || cam.id
    CAMERA_TO_LABEL[gpuId] = `${branch.name} · ${cam.label}`
  }
}

// Etiquetas YOLO que disparan alertas de vigilancia
const ALERT_CONFIG: Record<string, { emoji: string; text: string; color: string }> = {
  cigarette: { emoji: '🚬', text: 'Cigarrillo detectado', color: 'red' },
  vape:      { emoji: '💨', text: 'Vape detectado',       color: 'red' },
}

// Cooldown por cámara+label antes de volver a alertar (60s)
const ALERT_COOLDOWN_MS = 60_000
const MAX_ALERTS = 30

// =========================================================================
// HELPERS DE MÓDULO
// =========================================================================
async function sendGpuHeartbeat(cameras: string[]) {
  try {
    await fetch('/api/vision/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_cameras: cameras }),
    })
  } catch { /* silencioso */ }
}

// Labels que provienen del GPU tras la redesign de main.py
const BARBER_SET = new Set(['barber', 'barber_working', 'staff', 'receptionist'])
const CLIENT_SET = new Set(['client', 'child_client'])

function parseDetections(detections: any[]): VisionData {
  const people: VisionData['people'] = []
  const chairs: VisionData['chairs'] = []
  let total_barbers = 0, total_clients = 0, occupied_chairs = 0

  for (const d of detections || []) {
    const lbl = (d.label || '').toLowerCase()
    if (BARBER_SET.has(lbl)) {
      people.push({ type: 'barber', box_2d: d.box })
      total_barbers++
    } else if (CLIENT_SET.has(lbl)) {
      people.push({ type: 'client', box_2d: d.box })
      total_clients++
    }
    if (lbl === 'chair_empty' || lbl === 'chair_occupied') {
      const occupied = lbl === 'chair_occupied'
      chairs.push({ status: occupied ? 'occupied' : 'empty', box_2d: d.box })
      if (occupied) occupied_chairs++
    }
  }
  return { people, chairs, summary: { total_barbers, total_clients, occupied_chairs } }
}

function playAlertTone() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch { /* AudioContext no disponible */ }
}

function relativeTime(date: Date | null): { text: string; level: 'ok' | 'warn' | 'stale' } {
  if (!date) return { text: 'sin señal', level: 'stale' }
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 5)   return { text: `hace ${secs}s`,  level: 'ok' }
  if (secs < 30)  return { text: `hace ${secs}s`,  level: 'warn' }
  if (secs < 120) return { text: `hace ${secs}s`,  level: 'stale' }
  return { text: 'sin señal', level: 'stale' }
}

// =========================================================================
// VISION PANEL (componente principal)
// =========================================================================
export function VisionPanel() {
  const { t } = useI18n()

  // — Navegación —
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ndp')
  const [gridSize, setGridSize]                 = useState<1 | 2>(2)
  const [activeCameraIndex, setActiveCameraIndex] = useState(0)
  const [mirabelPage, setMirabelPage]           = useState(0)

  // — WS y datos de cámaras —
  const [wsConnected, setWsConnected]       = useState(false)
  const [cameraStates, setCameraStates]     = useState<Map<string, CameraState>>(new Map())
  const wsRef                               = useRef<WebSocket | null>(null)
  const wsWarmupDone                        = useRef(false)

  // — Alertas —
  const [alerts, setAlerts]           = useState<VisionAlert[]>([])
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const recentAlertKeys                 = useRef<Map<string, number>>(new Map()) // key → timestamp

  // — Heartbeat —
  const activeCamerasRef = useRef<string[]>([])

  const isMirabel = selectedBranchId === 'mirabel'

  // Cámaras visibles en la grid
  const activeBranch  = BRANCHES.find(b => b.id === selectedBranchId) || BRANCHES[0]
  const visibleCameras = useMemo(() => {
    if (isMirabel) return activeBranch.cameras.slice(mirabelPage * 2, mirabelPage * 2 + 2)
    if (gridSize === 1) return [activeBranch.cameras[activeCameraIndex] || activeBranch.cameras[0]]
    return activeBranch.cameras.slice(0, 2)
  }, [isMirabel, activeBranch, mirabelPage, gridSize, activeCameraIndex])

  const visibleGpuIds = useMemo(
    () => visibleCameras.map(c => BRANCH_TO_CAMERA[c.id] || c.id),
    [visibleCameras],
  )

  const getActiveCameraIds = useCallback((branchId: string, grid: 1 | 2, camIdx: number, mPage: number) => {
    const branch = BRANCHES.find(b => b.id === branchId) || BRANCHES[0]
    if (branchId === 'mirabel') return branch.cameras.slice(mPage * 2, mPage * 2 + 2).map(c => BRANCH_TO_CAMERA[c.id] || c.id)
    const cams = grid === 1 ? [branch.cameras[camIdx] || branch.cameras[0]] : branch.cameras.slice(0, 2)
    return cams.map(c => BRANCH_TO_CAMERA[c.id] || c.id)
  }, [])

  const updateGpu = useCallback((branchId: string, grid: 1 | 2, camIdx: number, mPage: number) => {
    const cameras = getActiveCameraIds(branchId, grid, camIdx, mPage)
    activeCamerasRef.current = cameras
    sendGpuHeartbeat(cameras)
  }, [getActiveCameraIds])

  // — WS único a nivel de panel —
  useEffect(() => {
    let unmounted = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function openWs() {
      if (unmounted) return
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/api/vision/ws-proxy`)
      wsRef.current = ws

      ws.onopen = () => { if (!unmounted) setWsConnected(true) }

      ws.onmessage = (evt) => {
        if (unmounted) return
        try {
          const msg = JSON.parse(evt.data)
          const { camera, detections, stats: backendStats } = msg
          if (!camera) return

          const data  = parseDetections(detections)
          const stats: VisionStats = backendStats
            ? { ...EMPTY_STATS, ...backendStats }
            : EMPTY_STATS
          const now = new Date()

          setCameraStates(prev => {
            const next = new Map(prev)
            next.set(camera, { detections: detections || [], data, stats, lastUpdate: now })
            return next
          })

          // — Chequeo de alertas (prioriza stats.alerts del backend) —
          const alertLabels: string[] = Array.isArray(backendStats?.alerts)
            ? backendStats.alerts
            : (detections || []).map((d: any) => d.label).filter(Boolean)

          for (const label of alertLabels) {
            const cfg = ALERT_CONFIG[label]
            if (!cfg) continue
            const key = `${camera}:${label}`
            const lastSeen = recentAlertKeys.current.get(key) ?? 0
            if (Date.now() - lastSeen < ALERT_COOLDOWN_MS) continue

            recentAlertKeys.current.set(key, Date.now())
            const alert: VisionAlert = {
              id:          `${key}:${Date.now()}`,
              cameraId:    camera,
              cameraLabel: CAMERA_TO_LABEL[camera] || camera,
              label,
              timestamp:   now,
            }
            setAlerts(prev => [alert, ...prev].slice(0, MAX_ALERTS))
            setUnreadAlerts(n => n + 1)
            if (soundEnabled) playAlertTone()
          }
        } catch { /* ignorar mensajes malformados */ }
      }

      ws.onerror = () => { if (!unmounted) setWsConnected(false) }
      ws.onclose = () => {
        if (!unmounted) {
          setWsConnected(false)
          reconnectTimer = setTimeout(openWs, 3000)
        }
      }
    }

    async function connect() {
      if (!wsWarmupDone.current) {
        try { await fetch('/api/vision/ws-proxy') } catch { /* ignorar */ }
        wsWarmupDone.current = true
      }
      if (!unmounted) openWs()
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // — Heartbeat loop —
  useEffect(() => {
    updateGpu(selectedBranchId, gridSize, activeCameraIndex, mirabelPage)
    const iv = setInterval(() => sendGpuHeartbeat(activeCamerasRef.current), 5_000)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // — Handlers de navegación —
  const handleToggleBranch = (id: string) => {
    setSelectedBranchId(id); setActiveCameraIndex(0); setMirabelPage(0)
    updateGpu(id, gridSize, 0, 0)
  }
  const handleGridChange = (size: 1 | 2) => {
    setGridSize(size); setActiveCameraIndex(0)
    updateGpu(selectedBranchId, size, 0, mirabelPage)
  }
  const handleCameraChange = (idx: number) => {
    setActiveCameraIndex(idx)
    updateGpu(selectedBranchId, gridSize, idx, mirabelPage)
  }
  const handleMirabelPage = (page: number) => {
    setMirabelPage(page)
    updateGpu('mirabel', gridSize, activeCameraIndex, page)
  }

  const mirabelTotalPages = Math.ceil(activeBranch.cameras.length / 2)

  // — Stats agregados de las cámaras visibles (usa stats del GPU) —
  const aggregateStats = useMemo(() => {
    let barbersWorking = 0, barbersIdle = 0, barbersPresent = 0
    let clientsInChair = 0, clientsWaiting = 0
    let occupied = 0, totalChairs = 0
    for (const gpuId of visibleGpuIds) {
      const state = cameraStates.get(gpuId)
      if (!state) continue
      barbersWorking += state.stats.barbers_working
      barbersIdle    += state.stats.barbers_idle
      barbersPresent += state.stats.barbers_present
      clientsInChair += state.stats.clients_in_chair
      clientsWaiting += state.stats.clients_waiting
      occupied       += state.stats.chairs_occupied
      totalChairs    += state.stats.chairs_total
    }
    const barbers = barbersPresent || (barbersWorking + barbersIdle)
    const clients = clientsInChair + clientsWaiting
    const occupancyPct = totalChairs > 0 ? Math.round((occupied / totalChairs) * 100) : 0
    return {
      barbers, barbersWorking, barbersIdle,
      clients, clientsInChair, clientsWaiting,
      occupied, totalChairs, occupancyPct,
    }
  }, [cameraStates, visibleGpuIds])

  // — Alerta activa en alguna cámara visible —
  const activeAlertCameras = useMemo(() => {
    const active = new Set<string>()
    const cutoff = Date.now() - 30_000  // alerta visible 30s
    for (const a of alerts) {
      if (a.timestamp.getTime() > cutoff) active.add(a.cameraId)
    }
    return active
  }, [alerts])

  const handleOpenAlertDrawer = () => {
    setAlertDrawerOpen(true)
    setUnreadAlerts(0)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 md:p-6 md:pr-24 pb-24 lg:pb-6 relative scroll-smooth animate-in fade-in slide-in-from-bottom-4 duration-500 panel-stagger">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("panel.vision")}</h2>
          <p className="text-muted-foreground">{t("panel.vision.desc")}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sonido */}
          <button
            onClick={() => setSoundEnabled(s => !s)}
            title={soundEnabled ? 'Silenciar alertas' : 'Activar sonido de alertas'}
            className={cn(
              "p-2 rounded-lg text-xs font-bold transition-all border",
              soundEnabled
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                : "bg-muted/40 border-border/50 text-muted-foreground",
            )}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>

          {/* Campana de alertas */}
          <button
            onClick={handleOpenAlertDrawer}
            className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-all"
            title="Ver alertas"
          >
            {alerts.length > 0
              ? <BellRing className="size-5 text-amber-400" />
              : <Bell className="size-5" />
            }
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-[9px] font-black text-white flex items-center justify-center shadow-lg">
                {unreadAlerts > 9 ? '9+' : unreadAlerts}
              </span>
            )}
          </button>

          {/* Grid size toggle */}
          {!isMirabel && (
            <div className="flex items-center gap-1 rounded-xl bg-background/40 p-1 border border-border/50">
              <button
                onClick={() => handleGridChange(1)}
                className={cn("p-2 rounded-lg transition-all", gridSize === 1 ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted text-muted-foreground")}
                title="Vista 1 cámara"
              >
                <div className="size-4 border-2 border-current rounded-sm" />
              </button>
              <button
                onClick={() => handleGridChange(2)}
                className={cn("p-2 rounded-lg transition-all", gridSize === 2 ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted text-muted-foreground")}
                title="Vista 2 cámaras"
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Branch Selector ────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {BRANCHES.map(branch => (
            <button
              key={branch.id}
              onClick={() => handleToggleBranch(branch.id)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold border transition-all",
                selectedBranchId === branch.id
                  ? "bg-primary border-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)] scale-105"
                  : "bg-background/40 border-border/50 text-muted-foreground hover:bg-muted",
              )}
            >
              {branch.name}
            </button>
          ))}
        </div>

        {/* Camera Tabs — NDP en vista individual */}
        {!isMirabel && gridSize === 1 && activeBranch.cameras.length > 1 && (
          <div className="flex gap-2 mt-1">
            {activeBranch.cameras.map((cam, idx) => (
              <button
                key={cam.id}
                onClick={() => handleCameraChange(idx)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                  activeCameraIndex === idx
                    ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                    : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted",
                )}
              >
                {cam.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── GPU status + Occupancy bar ─────────────────────── */}
      <OccupancyBar
        wsConnected={wsConnected}
        activeCameraIds={visibleGpuIds}
        stats={aggregateStats}
        hasAlerts={activeAlertCameras.size > 0}
        onAlertClick={handleOpenAlertDrawer}
      />

      {/* ── Camera Grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[400px]">
        {visibleCameras.map(cam => {
          const gpuId   = BRANCH_TO_CAMERA[cam.id] || cam.id
          const state   = cameraStates.get(gpuId) ?? null
          return (
            <CameraCard
              key={cam.id}
              branchId={cam.id}
              branchName={`${activeBranch.name} (${cam.label})`}
              rotation={(cam as any).rotation}
              detections={state?.detections ?? []}
              visionData={state?.data ?? null}
              stats={state?.stats ?? EMPTY_STATS}
              lastUpdate={state?.lastUpdate ?? null}
              hasAlert={activeAlertCameras.has(gpuId)}
              wsConnected={wsConnected}
            />
          )
        })}
      </div>

      {/* ── Mirabel Pagination ─────────────────────────────── */}
      {isMirabel && (
        <div className="flex items-center justify-center gap-2 py-2">
          {Array.from({ length: mirabelTotalPages }, (_, i) => {
            const s = i * 2 + 1
            const e = Math.min(i * 2 + 2, activeBranch.cameras.length)
            return (
              <button
                key={i}
                onClick={() => handleMirabelPage(i)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all",
                  mirabelPage === i
                    ? "bg-primary border-primary text-primary-foreground shadow-md"
                    : "bg-background/40 border-border/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {s === e ? `Cam ${s}` : `Cam ${s}–${e}`}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Alert Drawer ───────────────────────────────────── */}
      <AlertDrawer
        alerts={alerts}
        open={alertDrawerOpen}
        onClose={() => setAlertDrawerOpen(false)}
        onDismiss={(id) => setAlerts(prev => prev.filter(a => a.id !== id))}
        onDismissAll={() => setAlerts([])}
      />
    </div>
  )
}

// =========================================================================
// OCCUPANCY BAR
// =========================================================================
interface AggregateStats {
  barbers: number
  barbersWorking: number
  barbersIdle: number
  clients: number
  clientsInChair: number
  clientsWaiting: number
  occupied: number
  totalChairs: number
  occupancyPct: number
}

function OccupancyBar({
  wsConnected, activeCameraIds, stats, hasAlerts, onAlertClick,
}: {
  wsConnected: boolean
  activeCameraIds: string[]
  stats: AggregateStats
  hasAlerts: boolean
  onAlertClick: () => void
}) {
  const hasCameraData =
    stats.totalChairs > 0 || stats.barbers > 0 || stats.clients > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Conexión GPU */}
      <div className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 border text-[10px] font-bold uppercase tracking-widest",
        wsConnected
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
          : "bg-amber-500/10 border-amber-500/20 text-amber-500",
      )}>
        <div className={cn("size-1.5 rounded-full", wsConnected ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" : "bg-amber-400")} />
        {wsConnected ? `GPU · ${activeCameraIds.join(', ')}` : 'Reconectando...'}
      </div>

      {/* Stats — solo cuando hay datos de YOLO */}
      {hasCameraData && (
        <>
          {/* Barberos con desglose working / idle */}
          <div className="flex items-center gap-1.5 bg-background/40 border border-border/50 rounded-full px-3 py-1">
            <Scissors className="size-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-foreground">{stats.barbers}</span>
            <span className="text-[10px] text-muted-foreground">barberos</span>
            {(stats.barbersWorking > 0 || stats.barbersIdle > 0) && (
              <span className="text-[9px] font-bold text-muted-foreground ml-1 flex items-center gap-1">
                <span className="text-emerald-400">{stats.barbersWorking}▲</span>
                <span className="text-amber-400">{stats.barbersIdle}●</span>
              </span>
            )}
          </div>

          {/* Clientes: en silla + en espera */}
          <div className="flex items-center gap-1.5 bg-background/40 border border-border/50 rounded-full px-3 py-1">
            <Users className="size-3 text-blue-400" />
            <span className="text-[10px] font-bold text-foreground">{stats.clients}</span>
            <span className="text-[10px] text-muted-foreground">clientes</span>
            {stats.clientsWaiting > 0 && (
              <span className="text-[9px] font-bold text-amber-400 ml-1">
                {stats.clientsWaiting} en espera
              </span>
            )}
          </div>

          {stats.totalChairs > 0 && (
            <div className="flex items-center gap-2 bg-background/40 border border-border/50 rounded-full px-3 py-1">
              <span className="text-[10px] text-muted-foreground">Sillas</span>
              {/* Mini barra de ocupación */}
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    stats.occupancyPct > 80 ? "bg-red-400" : stats.occupancyPct > 50 ? "bg-amber-400" : "bg-emerald-400",
                  )}
                  style={{ width: `${stats.occupancyPct}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-foreground">
                {stats.occupied}/{stats.totalChairs} · {stats.occupancyPct}%
              </span>
            </div>
          )}
        </>
      )}

      {/* Alerta activa */}
      {hasAlerts && (
        <button
          onClick={onAlertClick}
          className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1 animate-pulse"
        >
          <BellRing className="size-3 text-red-400" />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Alerta activa</span>
        </button>
      )}
    </div>
  )
}

// =========================================================================
// ALERT DRAWER
// =========================================================================
function AlertDrawer({
  alerts, open, onClose, onDismiss, onDismissAll,
}: {
  alerts: VisionAlert[]
  open: boolean
  onClose: () => void
  onDismiss: (id: string) => void
  onDismissAll: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={cn(
        "fixed top-0 right-0 h-full w-80 z-[95] bg-background/95 backdrop-blur-xl border-l border-border/60 shadow-2xl flex flex-col transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <BellRing className="size-4 text-amber-400" />
            <span className="font-bold text-sm">Alertas de vigilancia</span>
            {alerts.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-red-500/20">
                {alerts.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {alerts.length > 0 && (
              <button
                onClick={onDismissAll}
                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-all"
              >
                Limpiar todo
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-all">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto py-2">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <BellRing className="size-8 opacity-20" />
              <p className="text-xs">Sin alertas recientes</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-2">
              {alerts.map(alert => {
                const cfg = ALERT_CONFIG[alert.label]
                const ageMs = Date.now() - alert.timestamp.getTime()
                const isNew = ageMs < 30_000
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border transition-all",
                      isNew
                        ? "bg-red-500/10 border-red-500/20"
                        : "bg-background/40 border-border/40",
                    )}
                  >
                    <span className="text-xl shrink-0 mt-0.5">{cfg?.emoji ?? '⚠️'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-bold truncate", isNew ? "text-red-400" : "text-foreground")}>
                        {cfg?.text ?? alert.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{alert.cameraLabel}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {alert.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => onDismiss(alert.id)}
                      className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// =========================================================================
// CAMERA CARD — recibe detecciones del WS del VisionPanel (sin WS propio)
// =========================================================================
function CameraCard({
  branchId, branchName, rotation,
  detections, visionData, stats, lastUpdate, hasAlert, wsConnected,
}: {
  branchId: string
  branchName: string
  rotation?: 0 | -90
  detections: any[]
  visionData: VisionData | null
  stats: VisionStats
  lastUpdate: Date | null
  hasAlert: boolean
  wsConnected: boolean
}) {
  const { t } = useI18n()
  const [sizeMode, setSizeMode]             = useState<'small' | 'fullscreen'>('small')
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [reconnectKey, setReconnectKey]     = useState(0)
  const cardRef                             = useRef<HTMLDivElement>(null)


  const streamCameraId = BRANCH_TO_CAMERA[branchId] || branchId

  // — Tiempo relativo de última detección (re-render cada segundo) —
  const [, forceRender] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => forceRender(n => n + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  const { text: ageText, level: ageLevel } = relativeTime(lastUpdate)
  const ageColor = ageLevel === 'ok' ? 'text-emerald-400' : ageLevel === 'warn' ? 'text-amber-400' : 'text-red-400/70'

  useEffect(() => {
    const handler = () => setIsNativeFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleNativeFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else cardRef.current?.requestFullscreen()
  }

  // — Snapshot: captura el frame actual del <video> WebRTC —
  const handleSnapshot = () => {
    // Buscar el <video> dentro del card
    const video = cardRef.current?.querySelector('video')
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || video.clientWidth
    canvas.height = video.videoHeight || video.clientHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href    = url
      a.download = `snapshot_${streamCameraId}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/jpeg', 0.92)
  }

  const isLoading = !wsConnected && !lastUpdate

  return (
    <Card
      ref={cardRef}
      className={cn(
        "glass-panel overflow-hidden border-border/50 shadow-xl transition-all duration-500",
        hasAlert && "ring-2 ring-red-500/50 shadow-red-500/20",
        sizeMode === 'fullscreen' && "fixed inset-0 z-[100] m-0 rounded-none w-screen h-screen flex flex-col",
      )}
    >
      <CardHeader className="p-3 flex flex-row items-center justify-between bg-background/40 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Controles de tamaño */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSizeMode(sizeMode === 'fullscreen' ? 'small' : 'fullscreen')}
              className={cn("size-6 rounded flex items-center justify-center transition-all", sizeMode === 'fullscreen' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
              title={sizeMode === 'fullscreen' ? "Reducir" : "Maximizar"}
            >
              <Maximize2 className="size-3" />
            </button>
            <button
              onClick={handleNativeFullscreen}
              className={cn("size-6 rounded flex items-center justify-center transition-all", isNativeFullscreen ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
              title={isNativeFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              <Expand className="size-3" />
            </button>
          </div>

          <div className="w-px h-5 bg-border/40 shrink-0" />

          {/* Info de cámara */}
          <div className="min-w-0">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 truncate">
              {hasAlert
                ? <BellRing className="size-3 text-red-400 shrink-0 animate-bounce" />
                : <div className={cn("size-2 rounded-full shrink-0", wsConnected ? "bg-green-500 animate-pulse" : "bg-amber-400")} />
              }
              <span className="truncate">{branchName}</span>
            </CardTitle>
            <div className="flex items-center gap-1.5 mt-0.5">
              {/* Indicador de salud: tiempo desde última detección */}
              <span className={cn("text-[9px] font-bold uppercase tracking-wider", ageColor)}>
                {ageText}
              </span>
              {(stats.barbers_present > 0 || stats.clients_in_chair > 0 || stats.clients_waiting > 0) && (
                <>
                  <span className="text-muted-foreground text-[9px]">·</span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                    <span className="text-emerald-400 font-bold">{stats.barbers_working}w</span>
                    <span className="text-amber-400 font-bold">{stats.barbers_idle}i</span>
                    <span>✂️</span>
                    <span className="text-blue-400 font-bold">{stats.clients_in_chair}</span>
                    {stats.clients_waiting > 0 && (
                      <span className="text-amber-400 font-bold">+{stats.clients_waiting}⏳</span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Controles derecha */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Snapshot */}
          <button
            onClick={handleSnapshot}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-all"
            title="Capturar frame"
          >
            <Download className="size-3.5" />
          </button>

          {/* Reconectar WebRTC */}
          <button
            onClick={() => setReconnectKey(k => k + 1)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-all"
            title="Reconectar video"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </button>
        </div>
      </CardHeader>

      <CardContent className={cn(
        "p-0 relative bg-neutral-950 flex flex-col items-center justify-center overflow-hidden",
        sizeMode === 'fullscreen'
          ? "flex-1"
          : rotation === -90
            ? "h-[72vh] aspect-[9/16] mx-auto shadow-2xl border-x border-border/20"
            : "aspect-video w-full max-w-[1200px] mx-auto shadow-2xl border-x border-border/20",
      )}>
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Dot grid decorativo */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}
          />

          {/* Video WebRTC + AR canvas */}
          <div className="absolute inset-0 z-0">
            <LiveVisionCamera
              cameraName={streamCameraId}
              externalDetections={detections}
              rotation={rotation}
              reconnectKey={reconnectKey}
            />
          </div>

          {/* HUD de métricas AR */}
          {visionData && (
            <div className="absolute bottom-3 left-3 flex flex-row gap-1.5 pointer-events-none z-30 flex-wrap">
              <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80] flex-shrink-0" />
                <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                  {t("panel.vision.barbers")}: {stats.barbers_present || visionData.summary.total_barbers}
                </span>
                {stats.barbers_working > 0 && (
                  <span className="text-[9px] font-black text-emerald-300">
                    · {stats.barbers_working} activos
                  </span>
                )}
              </div>

              <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                <span className="size-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa] flex-shrink-0" />
                <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                  {t("panel.vision.clients")}: {stats.clients_in_chair || visionData.summary.total_clients}
                </span>
                {stats.clients_waiting > 0 && (
                  <span className="text-[9px] font-black text-amber-300">
                    · {stats.clients_waiting} espera
                  </span>
                )}
              </div>

              {stats.chairs_total > 0 && (
                <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                  <span className="text-[9px] font-bold text-white/80 uppercase tracking-tighter">
                    {t("panel.vision.occupancy")}:
                  </span>
                  <span className="text-[9px] font-black text-white">
                    {stats.chairs_occupied}/{stats.chairs_total}
                    {' · '}
                    {Math.round((stats.chairs_occupied / stats.chairs_total) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Alerta de vigilancia activa (banner top) */}
          {hasAlert && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-red-500/20 border border-red-500/50 rounded-full px-3 py-1 z-40 animate-pulse">
              <BellRing className="size-3 text-red-400" />
              <span className="text-[9px] font-bold text-red-300 uppercase tracking-wider">Alerta detectada</span>
            </div>
          )}

          {/* Badge reconectando WS */}
          {!wsConnected && lastUpdate && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/70 border border-amber-500/40 rounded-full px-3 py-1 z-40 pointer-events-none">
              <WifiOff className="size-3 text-amber-400 opacity-70" />
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Reconectando...</span>
            </div>
          )}

          {/* Spinner inicial */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground z-10">
              <div className="relative">
                <Camera className="size-12 opacity-20" />
                <div className="absolute inset-0 size-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
              <p className="text-xs uppercase tracking-widest animate-pulse">{t("panel.vision.connecting")}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
