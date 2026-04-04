"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Eye, Camera, RefreshCw, BarChart3, Users, LayoutGrid, Maximize2, Minimize2, X, Scissors, User, Loader2, WifiOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

import LiveVisionCamera from "./live-vision-camera"

interface VisionData {
  people: Array<{ type: 'barber' | 'client', box_2d: [number, number, number, number] }>
  chairs: Array<{ status: 'occupied' | 'empty', box_2d: [number, number, number, number] }>
  summary: {
    total_barbers: number
    total_clients: number
    occupied_chairs: number
  }
  image?: string
}

const visionCache = new Map<string, { data: VisionData, lastUpdate: Date }>();

const BRANCH_TO_CAMERA: Record<string, string> = {
  'ndp': 'ndp_stations',
  'ndp2': 'ndp_stations2',
  'mirabel': 'mirabel'
};

const BRANCHES = [
  { 
    id: 'ndp', 
    name: 'Notre-Dame-des-Prairies',
    cameras: [
      { id: 'ndp', label: 'Principal' },
      { id: 'ndp2', label: 'Vista 2' }
    ]
  },
  { 
    id: 'mirabel', 
    name: 'Mirabel',
    cameras: [{ id: 'mirabel', label: 'Principal' }]
  }
]

// =========================================================================
// Session Manager — communicates with /api/vision/session
// =========================================================================
async function updateVisionSession(cameras: string[], action: 'start' | 'stop' = 'start') {
  try {
    await fetch('/api/vision/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': process.env.NEXT_PUBLIC_SESSION_SECRET || 'vision_session_2026',
      },
      body: JSON.stringify({ cameras, action }),
    });
  } catch (e) {
    console.warn('[VisionSession] Failed to update session:', e);
  }
}

// sendBeacon version — used on tab close/page unload (guaranteed delivery)
function stopVisionSessionBeacon() {
  const body = JSON.stringify({ cameras: [], action: 'stop' });
  navigator.sendBeacon(
    '/api/vision/session',
    new Blob([body], { type: 'application/json' })
  );
}

// =========================================================================
// VisionPanel
// =========================================================================
export function VisionPanel() {
  const { t } = useI18n()
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ndp')
  const [gridSize, setGridSize] = useState<1 | 2>(1)
  const [activeCameraIndex, setActiveCameraIndex] = useState(0)
  const sessionActiveRef = useRef(false)

  // Derive the active camera IDs from current UI state
  const getActiveCameraIds = useCallback((branchId: string, grid: 1 | 2, camIdx: number): string[] => {
    const branch = BRANCHES.find(b => b.id === branchId) || BRANCHES[0]
    const cams = grid === 1
      ? [branch.cameras[camIdx] || branch.cameras[0]]
      : branch.cameras.slice(0, 2)
    return cams.map(c => BRANCH_TO_CAMERA[c.id] || c.id)
  }, [])

  // Start / update the GPU session
  const startSession = useCallback((branchId: string, grid: 1 | 2, camIdx: number) => {
    const cameras = getActiveCameraIds(branchId, grid, camIdx)
    updateVisionSession(cameras, 'start')
    sessionActiveRef.current = true
  }, [getActiveCameraIds])

  // On mount → start session + heartbeat; on unmount → stop all
  useEffect(() => {
    startSession(selectedBranchId, gridSize, activeCameraIndex)

    // Heartbeat cada 20s — mantiene la sesión viva en Florence2.
    // Si el browser se cierra sin avisar, el watchdog (45s timeout) para las cámaras.
    const heartbeatInterval = setInterval(() => {
      fetch('/api/vision/heartbeat', { method: 'POST' }).catch(() => {/* silencioso */})
    }, 20_000)

    // Stop GPU on tab close / navigation away (sendBeacon es más confiable que fetch en beforeunload)
    window.addEventListener('beforeunload', stopVisionSessionBeacon)

    return () => {
      // Panel unmounted (user navigated to another tab in the dashboard)
      clearInterval(heartbeatInterval)
      updateVisionSession([], 'stop')
      sessionActiveRef.current = false
      window.removeEventListener('beforeunload', stopVisionSessionBeacon)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleBranch = (id: string) => {
    setSelectedBranchId(id)
    setActiveCameraIndex(0)
    // Immediately update GPU session with new cameras
    startSession(id, gridSize, 0)
  }

  const handleGridChange = (size: 1 | 2) => {
    setGridSize(size)
    setActiveCameraIndex(0)
    startSession(selectedBranchId, size, 0)
  }

  const handleCameraChange = (idx: number) => {
    setActiveCameraIndex(idx)
    startSession(selectedBranchId, gridSize, idx)
  }

  const activeBranch = BRANCHES.find(b => b.id === selectedBranchId) || BRANCHES[0]

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 md:p-6 md:pr-24 pb-24 lg:pb-6 relative scroll-smooth">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("panel.vision")}</h2>
          <p className="text-muted-foreground">{t("panel.vision.desc")}</p>
        </div>

        {/* Grid Size Toggle */}
        <div className="flex items-center gap-2 rounded-xl bg-background/40 p-1 border border-border/50">
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
            <div className="grid grid-cols-2 gap-0.5">
              <div className="size-1.5 border border-current rounded-sm" />
              <div className="size-1.5 border border-current rounded-sm" />
            </div>
          </button>
        </div>
      </div>

      {/* Branch Selector */}
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
                  : "bg-background/40 border-border/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {branch.name}
            </button>
          ))}
        </div>
        
        {/* Camera Tabs (single-view mode) */}
        {gridSize === 1 && activeBranch.cameras.length > 1 && (
          <div className="flex gap-2 mt-2">
            {activeBranch.cameras.map((cam, idx) => (
              <button
                key={cam.id}
                onClick={() => handleCameraChange(idx)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                  activeCameraIndex === idx 
                    ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" 
                    : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
                )}
              >
                {cam.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GPU Status Badge */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" />
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
            GPU Activo · {getActiveCameraIds(selectedBranchId, gridSize, activeCameraIndex).join(', ')}
          </span>
        </div>
      </div>

      {/* Camera Grid */}
      <div className={cn(
        "grid gap-4 flex-1 min-h-[400px]",
        gridSize === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
      )}>
        {gridSize === 1 ? (
          <CameraCard 
            key={activeBranch.cameras[activeCameraIndex].id} 
            branchId={activeBranch.cameras[activeCameraIndex].id} 
            branchName={`${activeBranch.name} (${activeBranch.cameras[activeCameraIndex].label})`} 
          />
        ) : (
          activeBranch.cameras.slice(0, 2).map(cam => (
            <CameraCard 
              key={cam.id} 
              branchId={cam.id} 
              branchName={`${activeBranch.name} (${cam.label})`} 
            />
          ))
        )}
      </div>
    </div>
  )
}

// =========================================================================
// CameraCard — individual camera display with SSE AR overlay
// =========================================================================
function CameraCard({ branchId, branchName }: { branchId: string, branchName: string }) {
  const { t } = useI18n()
  const cached = visionCache.get(branchId)
  const [data, setData] = useState<VisionData | null>(cached?.data || null)
  const [lastUpdate, setLastUpdate] = useState<Date>(cached?.lastUpdate || new Date())
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [sizeMode, setSizeMode] = useState<'small' | 'large' | 'fullscreen'>('small')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const streamCameraId = BRANCH_TO_CAMERA[branchId] || branchId;

  const fetchData = async () => {
    if (!visionCache.has(branchId)) setIsLoading(true)
    try {
      const response = await fetch(`/api/vision/latest?camera=${streamCameraId}`)
      if (!response.ok) throw new Error('Failed to fetch vision data')
      const result = await response.json()
      
      const people: Array<{ type: 'barber' | 'client', box_2d: [number, number, number, number] }> = [];
      const chairs: Array<{ status: 'occupied' | 'empty', box_2d: [number, number, number, number] }> = [];
      let total_barbers = 0;
      let total_clients = 0;
      let occupied_chairs = 0;

      (result.detections || []).forEach((d: any) => {
        const lbl = (d.label || '').toLowerCase();
        
        if (lbl.includes('barbero') || lbl.includes('barber') || lbl === 'person' || lbl === 'man' || lbl === 'woman') {
           people.push({ type: 'barber', box_2d: d.box });
           total_barbers++;
        } else if (lbl.includes('cliente') || lbl.includes('client')) {
           people.push({ type: 'client', box_2d: d.box });
           total_clients++;
        } 
        
        if (lbl.includes('ocupada') || lbl.includes('occupied') || lbl.includes('silla r')) {
           chairs.push({ status: 'occupied', box_2d: d.box });
           occupied_chairs++;
        } else if (lbl.includes('silla') || lbl.includes('chair') || lbl.includes('vacia') || lbl.includes('vacía')) {
           chairs.push({ status: 'empty', box_2d: d.box });
        }
      });

      const mappedData: VisionData = {
        people,
        chairs,
        summary: { total_barbers, total_clients, occupied_chairs },
        image: 'stream_active'
      };

      setData(mappedData)
      const now = new Date()
      setLastUpdate(now)
      visionCache.set(branchId, { data: mappedData, lastUpdate: now })
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [branchId])

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "glass-panel overflow-hidden border-border/50 shadow-xl group transition-all duration-500",
        sizeMode === 'large' && "lg:col-span-full",
        sizeMode === 'fullscreen' && "fixed inset-0 z-[100] m-0 rounded-none w-screen h-screen flex flex-col"
      )}
    >
      <CardHeader className="p-4 flex flex-row items-center justify-between bg-background/40 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 h-full">
            <button 
              onClick={() => setSizeMode('small')}
              className={cn("size-6 rounded flex items-center justify-center transition-all", sizeMode === 'small' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
            >
              <Minimize2 className="size-3" />
            </button>
            <button 
              onClick={() => setSizeMode('large')}
              className={cn("size-6 rounded flex items-center justify-center transition-all", sizeMode === 'large' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
            >
              <Maximize2 className="size-3" />
            </button>
            <button 
              onClick={() => setSizeMode(sizeMode === 'fullscreen' ? 'small' : 'fullscreen')}
              className={cn("size-6 rounded flex items-center justify-center transition-all", sizeMode === 'fullscreen' ? "bg-destructive text-destructive-foreground shadow-lg" : "hover:bg-muted text-muted-foreground")}
            >
              {sizeMode === 'fullscreen' ? <X className="size-3" /> : <LayoutGrid className="size-3" />}
            </button>
          </div>
          <div className="w-px h-6 bg-border/40 mx-1" />
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              {branchName}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {isLoading ? t("panel.vision.updating") : `${t("panel.vision.lastUpdate")}: ${lastUpdate.toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <button 
          onClick={fetchData} 
          disabled={isLoading}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50 transition-all"
        >
          <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
        </button>
      </CardHeader>
      <CardContent className={cn(
        "p-0 relative bg-neutral-950 flex flex-col items-center justify-center overflow-hidden",
        sizeMode === 'fullscreen' ? "flex-1" : "aspect-video w-full max-w-[1200px] mx-auto shadow-2xl border-x border-border/20"
      )}>
        {data ? (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                   style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
              
              <div className="absolute inset-0 z-0">
                <LiveVisionCamera cameraName={streamCameraId} />
              </div>
              
              {/* AR Metrics HUD — supérpuesto, esquina superior izquierda */}
              <div className="absolute top-3 left-3 flex flex-row gap-1.5 pointer-events-none z-30 flex-wrap">
                {/* Barberos */}
                <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                  <span className="size-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] flex-shrink-0" />
                  <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                    {t("panel.vision.barbers")}: {data.summary.total_barbers}
                  </span>
                </div>
                {/* Clientes */}
                <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                  <span className="size-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa] flex-shrink-0" />
                  <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                    {t("panel.vision.clients")}: {data.summary.total_clients}
                  </span>
                </div>
                {/* Ocupación — badge compacto */}
                <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                  <span className="text-[9px] font-bold text-white/80 uppercase tracking-tighter">
                    {t("panel.vision.occupancy")}:
                  </span>
                  <span className="text-[9px] font-black text-white">
                    {Math.round((data.summary.occupied_chairs / (data.chairs.length || 1)) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 text-red-400 p-8 text-center">
            <WifiOff className="size-8 opacity-50" />
            <p className="text-xs">{error}</p>
            <button onClick={fetchData} className="text-[10px] underline uppercase">{t("loading.retry")}</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <div className="relative">
              <Camera className="size-12 opacity-20" />
              <div className="absolute inset-0 size-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
            <p className="text-xs uppercase tracking-widest animate-pulse">{t("panel.vision.connecting")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
