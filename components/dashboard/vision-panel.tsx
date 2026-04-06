"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Eye, Camera, RefreshCw, BarChart3, Users, Maximize2, Expand, Scissors, User, Loader2, WifiOff } from "lucide-react"
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
};

const BRANCHES = [
  {
    id: 'ndp',
    name: 'Notre-Dame-des-Prairies',
    cameras: [
      { id: 'ndp',  label: 'Principal', rotation: 0 as 0 | -90 },
      { id: 'ndp2', label: 'Vista 2',   rotation: 0 as 0 | -90 }
    ]
  },
  {
    id: 'mirabel',
    name: 'Mirabel',
    cameras: [
      { id: 'mirabel1', label: 'Cámara 1', rotation: 0    as 0 | -90 },
      { id: 'mirabel2', label: 'Cámara 2', rotation: 0    as 0 | -90 },
      { id: 'mirabel3', label: 'Cámara 3', rotation: 0    as 0 | -90 },
      { id: 'mirabel4', label: 'Cámara 4', rotation: 0    as 0 | -90 },
      { id: 'mirabel5', label: 'Cámara 5', rotation: -90  as 0 | -90 },
    ]
  }
]

// =========================================================================
// GPU URL — leída desde el servidor en runtime para soportar Cloud Run.
// NEXT_PUBLIC_ vars se hornean en build-time y no funcionan con env vars
// dinámicas de Cloud Run. /api/vision/config las expone en runtime.
// =========================================================================
let gpuServerUrl = '';

async function resolveGpuUrl(): Promise<string> {
  if (gpuServerUrl) return gpuServerUrl;
  try {
    const res = await fetch('/api/vision/config');
    const json = await res.json();
    gpuServerUrl = json.gpuUrl || '';
  } catch { /* si falla, queda vacío */ }
  return gpuServerUrl;
}

async function sendGpuHeartbeat(cameras: string[]) {
  const url = await resolveGpuUrl();
  if (!url) return;
  try {
    await fetch(`${url}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_cameras: cameras }),
    });
  } catch { /* silencioso */ }
}

// =========================================================================
// VisionPanel
// =========================================================================
export function VisionPanel() {
  const { t } = useI18n()
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ndp')
  const [gridSize, setGridSize] = useState<1 | 2>(2)
  const [activeCameraIndex, setActiveCameraIndex] = useState(0)
  // mirabelPage: 0 → cams[0,1], 1 → cams[2,3], 2 → cams[4]
  const [mirabelPage, setMirabelPage] = useState(0)
  const sessionActiveRef = useRef(false)

  const isMirabel = selectedBranchId === 'mirabel'

  // Derive the active camera IDs from current UI state
  const getActiveCameraIds = useCallback((branchId: string, grid: 1 | 2, camIdx: number, mPage: number): string[] => {
    const branch = BRANCHES.find(b => b.id === branchId) || BRANCHES[0]
    if (branchId === 'mirabel') {
      return branch.cameras.slice(mPage * 2, mPage * 2 + 2).map(c => BRANCH_TO_CAMERA[c.id] || c.id)
    }
    const cams = grid === 1
      ? [branch.cameras[camIdx] || branch.cameras[0]]
      : branch.cameras.slice(0, 2)
    return cams.map(c => BRANCH_TO_CAMERA[c.id] || c.id)
  }, [])

  // Ref to track current cameras for the heartbeat interval
  const activeCamerasRef = useRef<string[]>([])

  // Update GPU server with current cameras
  const updateGpu = useCallback((branchId: string, grid: 1 | 2, camIdx: number, mPage: number) => {
    const cameras = getActiveCameraIds(branchId, grid, camIdx, mPage)
    activeCamerasRef.current = cameras
    sendGpuHeartbeat(cameras)
    sessionActiveRef.current = true
  }, [getActiveCameraIds])

  // On mount → start heartbeat loop; on unmount → GPU auto-cleans after 15s
  useEffect(() => {
    updateGpu(selectedBranchId, gridSize, activeCameraIndex, mirabelPage)

    const heartbeatInterval = setInterval(() => {
      sendGpuHeartbeat(activeCamerasRef.current)
    }, 5_000)

    return () => {
      clearInterval(heartbeatInterval)
      sessionActiveRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleBranch = (id: string) => {
    setSelectedBranchId(id)
    setActiveCameraIndex(0)
    setMirabelPage(0)
    updateGpu(id, gridSize, 0, 0)
  }

  const handleGridChange = (size: 1 | 2) => {
    setGridSize(size)
    setActiveCameraIndex(0)
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

  const activeBranch = BRANCHES.find(b => b.id === selectedBranchId) || BRANCHES[0]

  // Cameras currently visible in the grid
  const visibleCameras = isMirabel
    ? activeBranch.cameras.slice(mirabelPage * 2, mirabelPage * 2 + 2)
    : gridSize === 1
      ? [activeBranch.cameras[activeCameraIndex] || activeBranch.cameras[0]]
      : activeBranch.cameras.slice(0, 2)

  // Total pages for Mirabel
  const mirabelTotalPages = Math.ceil(activeBranch.cameras.length / 2)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 md:p-6 md:pr-24 pb-24 lg:pb-6 relative scroll-smooth animate-in fade-in slide-in-from-bottom-4 duration-500 panel-stagger">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("panel.vision")}</h2>
          <p className="text-muted-foreground">{t("panel.vision.desc")}</p>
        </div>

        {/* Grid Size Toggle — hidden for Mirabel (always 2 cameras) */}
        {!isMirabel && (
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
        )}
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

        {/* Camera Tabs — only for NDP in single-view mode */}
        {!isMirabel && gridSize === 1 && activeBranch.cameras.length > 1 && (
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
            GPU Activo · {getActiveCameraIds(selectedBranchId, gridSize, activeCameraIndex, mirabelPage).join(', ')}
          </span>
        </div>
      </div>

      {/* Camera Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[400px]">
        {visibleCameras.map(cam => (
          <CameraCard
            key={cam.id}
            branchId={cam.id}
            branchName={`${activeBranch.name} (${cam.label})`}
            rotation={(cam as any).rotation}
          />
        ))}
      </div>

      {/* Mirabel Pagination Bar */}
      {isMirabel && (
        <div className="flex items-center justify-center gap-2 py-2">
          {Array.from({ length: mirabelTotalPages }, (_, i) => {
            const startCam = i * 2 + 1;
            const endCam = Math.min(i * 2 + 2, activeBranch.cameras.length);
            const label = startCam === endCam ? `Cam ${startCam}` : `Cam ${startCam}–${endCam}`;
            return (
              <button
                key={i}
                onClick={() => handleMirabelPage(i)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all",
                  mirabelPage === i
                    ? "bg-primary border-primary text-primary-foreground shadow-md"
                    : "bg-background/40 border-border/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  )
}

// =========================================================================
// CameraCard — individual camera display with SSE AR overlay
// =========================================================================
function CameraCard({ branchId, branchName, rotation }: { branchId: string, branchName: string, rotation?: 0 | -90 }) {
  const { t } = useI18n()
  const cached = visionCache.get(branchId)
  const [data, setData] = useState<VisionData | null>(cached?.data || null)
  const [rawDetections, setRawDetections] = useState<any[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date>(cached?.lastUpdate || new Date())
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [sizeMode, setSizeMode] = useState<'small' | 'fullscreen'>('small')
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [reconnectKey, setReconnectKey] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setIsNativeFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleNativeFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      cardRef.current?.requestFullscreen()
    }
  }

  const streamCameraId = BRANCH_TO_CAMERA[branchId] || branchId;

  const parseDetections = (detections: any[]): VisionData => {
    const people: Array<{ type: 'barber' | 'client', box_2d: [number, number, number, number] }> = [];
    const chairs: Array<{ status: 'occupied' | 'empty', box_2d: [number, number, number, number] }> = [];
    let total_barbers = 0, total_clients = 0, occupied_chairs = 0;

    (detections || []).forEach((d: any) => {
      const lbl = (d.label || '').toLowerCase();
      if (lbl.includes('barber')) {
        people.push({ type: 'barber', box_2d: d.box }); total_barbers++;
      } else if (lbl.includes('client')) {
        people.push({ type: 'client', box_2d: d.box }); total_clients++;
      }
      if (lbl.includes('chair')) {
        const occupied = lbl.includes('occupied');
        chairs.push({ status: occupied ? 'occupied' : 'empty', box_2d: d.box });
        if (occupied) occupied_chairs++;
      }
    });

    return { people, chairs, summary: { total_barbers, total_clients, occupied_chairs }, image: 'stream_active' };
  };

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false
    let resolvedUrl = ''

    function connect() {
      if (unmounted || !resolvedUrl) return
      const wsUrl = resolvedUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/detections'
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => setError(null)

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.camera !== streamCameraId) return
          const mappedData = parseDetections(msg.detections)
          setData(mappedData)
          setRawDetections(msg.detections || [])
          const now = new Date()
          setLastUpdate(now)
          visionCache.set(branchId, { data: mappedData, lastUpdate: now })
          setIsLoading(false)
          setError(null)
        } catch { /* ignorar mensajes malformados */ }
      }

      ws.onerror = () => setError('WebSocket error')

      ws.onclose = () => {
        if (!unmounted) reconnectTimer = setTimeout(connect, 3000)
      }
    }

    resolveGpuUrl().then(url => {
      if (unmounted) return
      if (!url) { setError('GPU URL no configurado'); setIsLoading(false); return }
      resolvedUrl = url
      connect()
    })

    return () => {
      unmounted = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card
      ref={cardRef}
      className={cn(
        "glass-panel overflow-hidden border-border/50 shadow-xl group transition-all duration-500",
        sizeMode === 'fullscreen' && "fixed inset-0 z-[100] m-0 rounded-none w-screen h-screen flex flex-col"
      )}
    >
      <CardHeader className="p-4 flex flex-row items-center justify-between bg-background/40 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 h-full">
            {/* Maximizar — overlay modal sobre la interfaz */}
            <button
              onClick={() => setSizeMode(sizeMode === 'fullscreen' ? 'small' : 'fullscreen')}
              className={cn("size-6 rounded flex items-center justify-center transition-all", sizeMode === 'fullscreen' ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
              title={sizeMode === 'fullscreen' ? "Reducir" : "Maximizar"}
            >
              <Maximize2 className="size-3" />
            </button>
            {/* Pantalla completa — fullscreen nativo del navegador */}
            <button
              onClick={handleNativeFullscreen}
              className={cn("size-6 rounded flex items-center justify-center transition-all", isNativeFullscreen ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
              title={isNativeFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              <Expand className="size-3" />
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
          onClick={() => { wsRef.current?.close(); setReconnectKey(k => k + 1) }}
          disabled={isLoading}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50 transition-all"
          title="Reconectar"
        >
          <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
        </button>
      </CardHeader>
      <CardContent className={cn(
        "p-0 relative bg-neutral-950 flex flex-col items-center justify-center overflow-hidden",
        sizeMode === 'fullscreen'
          ? "flex-1"
          : rotation === -90
            ? "h-[72vh] aspect-[9/16] mx-auto shadow-2xl border-x border-border/20"
            : "aspect-video w-full max-w-[1200px] mx-auto shadow-2xl border-x border-border/20"
      )}>
        {/* Video siempre visible — no esperar datos de YOLO */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
               style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

          <div className="absolute inset-0 z-0">
            <LiveVisionCamera cameraName={streamCameraId} externalDetections={rawDetections} rotation={rotation} reconnectKey={reconnectKey} />
          </div>

          {/* AR Metrics HUD — solo cuando hay datos de YOLO */}
          {data && (
            <div className="absolute bottom-3 left-3 flex flex-row gap-1.5 pointer-events-none z-30 flex-wrap">
              <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                <span className="size-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] flex-shrink-0" />
                <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                  {t("panel.vision.barbers")}: {data.summary.total_barbers}
                </span>
              </div>
              <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                <span className="size-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa] flex-shrink-0" />
                <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                  {t("panel.vision.clients")}: {data.summary.total_clients}
                </span>
              </div>
              <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/20 shadow-lg">
                <span className="text-[9px] font-bold text-white/80 uppercase tracking-tighter">
                  {t("panel.vision.occupancy")}:
                </span>
                <span className="text-[9px] font-black text-white">
                  {Math.round((data.summary.occupied_chairs / (data.chairs.length || 1)) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400 bg-black/70 z-40">
              <WifiOff className="size-8 opacity-50" />
              <p className="text-xs">{error}</p>
              <button onClick={() => wsRef.current?.close()} className="text-[10px] underline uppercase">{t("loading.retry")}</button>
            </div>
          )}

          {/* Spinner solo mientras no hay datos y no hay error */}
          {!data && !error && (
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
