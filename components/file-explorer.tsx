"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Grid3X3,
  List,
  Search,
  HardDrive,
  Sparkles,
  RefreshCw,
  MoreVertical,
  Pencil,
  Trash2,
  Info,
  X,
  Play,
  Pause,
  ExternalLink,
  FolderInput,
  MessageSquarePlus,
  AlertTriangle,
  Check,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ExplorerFolder } from "@/lib/firestore"

// ---------- Types ----------
interface GCSFile {
  name: string
  bucket: string
  size: string
  contentType: string
  updated: string
  selfLink: string
  mediaLink: string
}

export interface LocalFile {
  id?: string
  name: string
  mimeType: string
  data: string
  previewUrl?: string
  source: "uploaded" | "generated"
  timestamp: number
  storagePath?: string
  folderId?: string
}

export interface FileExplorerProps {
  onClose: () => void
  localFiles: LocalFile[]
  folders: ExplorerFolder[]
  onUploadFile?: (file: LocalFile) => void
  onDeleteFile?: (fileId: string, storagePath: string) => void
  onCreateFolder?: (name: string, parentId?: string) => void
  onRenameFile?: (fileId: string, newName: string) => void
  onMoveFile?: (fileId: string, newFolderId: string | null) => void
  onRenameFolder?: (folderId: string, newName: string) => void
  onDeleteFolder?: (folderId: string) => void
  onAddFileToChat?: (file: LocalFile) => void
}

type ViewMode = "grid" | "list"
type FileSource = "all" | "bucket" | "local"

interface DisplayFile {
  type: "folder" | "file"
  id?: string
  name: string
  displayName: string
  mimeType: string
  size: string
  updated: string
  source: "bucket" | "uploaded" | "generated" | "folder"
  data?: string
  previewUrl?: string
  storagePath?: string
  folderId?: string
}

// ---------- Helpers ----------
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon
  if (mimeType.startsWith("video/")) return Video
  if (mimeType.startsWith("audio/")) return Music
  return FileText
}

function getFileIconColor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "text-green-500"
  if (mimeType.startsWith("video/")) return "text-red-500"
  if (mimeType.startsWith("audio/")) return "text-purple-500"
  if (mimeType === "application/pdf") return "text-red-400"
  return "text-primary"
}

function formatFileSize(bytes: number | string) {
  const b = typeof bytes === "string" ? parseInt(bytes, 10) : bytes
  if (isNaN(b) || b === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function getFileName(fullPath: string) {
  const parts = fullPath.split("/")
  return parts[parts.length - 1] || fullPath
}

/** Deduplicate name: if "photo.png" exists, returns "photo (1).png" etc. */
function deduplicateName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  const dotIdx = name.lastIndexOf(".")
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name
  const ext = dotIdx > 0 ? name.slice(dotIdx) : ""
  let counter = 1
  while (existingNames.has(`${base} (${counter})${ext}`)) counter++
  return `${base} (${counter})${ext}`
}

function getDataUrl(file: DisplayFile) {
  if (file.previewUrl) return file.previewUrl
  if (file.data) {
    if (file.data.startsWith("http") || file.data.startsWith("data:")) return file.data
    return `data:${file.mimeType};base64,${file.data}`
  }
  return ""
}

// ---------- Preview Modal ----------
function PreviewModal({ file, onClose }: { file: DisplayFile; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = (el: HTMLVideoElement | HTMLAudioElement | null) => {
    if (!el) return
    if (el.paused) { el.play(); setIsPlaying(true) } else { el.pause(); setIsPlaying(false) }
  }

  const url = getDataUrl(file)
  const isImage = file.mimeType.startsWith("image/")
  const isVideo = file.mimeType.startsWith("video/")
  const isAudio = file.mimeType.startsWith("audio/")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-[85vh] max-w-[85vw] flex-col items-center glass rounded-2xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -right-2 -top-2 z-10 flex size-8 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-110">
          <X className="size-4" />
        </button>
        <p className="mb-3 max-w-md truncate text-sm font-medium text-foreground">{file.displayName}</p>
        {isImage && <img src={url} alt={file.displayName} className="max-h-[70vh] max-w-full rounded-lg object-contain" crossOrigin="anonymous" />}
        {isVideo && <video ref={videoRef} src={url} className="max-h-[70vh] max-w-full rounded-lg" controls onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />}
        {isAudio && (
          <div className="flex w-80 flex-col items-center gap-4 rounded-xl bg-muted p-6">
            <div className="flex size-20 items-center justify-center rounded-full bg-purple-500/20"><Music className="size-10 text-purple-500" /></div>
            <button onClick={() => togglePlay(audioRef.current)} className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105">
              {isPlaying ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
            </button>
            <audio ref={audioRef} src={url} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} controls className="w-full" />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Properties Modal ----------
function PropertiesModal({ file, onClose }: { file: DisplayFile; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-80 glass rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("files.properties")}</h3>
          <button onClick={onClose} className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div><span className="text-xs text-muted-foreground">{t("files.propName")}</span><p className="break-all text-sm text-foreground">{file.displayName}</p></div>
          <div><span className="text-xs text-muted-foreground">{t("files.propType")}</span><p className="text-sm text-foreground">{file.mimeType}</p></div>
          {file.size && <div><span className="text-xs text-muted-foreground">{t("files.propSize")}</span><p className="text-sm text-foreground">{formatFileSize(file.size)}</p></div>}
          {file.updated && <div><span className="text-xs text-muted-foreground">{t("files.propDate")}</span><p className="text-sm text-foreground">{new Date(file.updated).toLocaleString()}</p></div>}
          <div><span className="text-xs text-muted-foreground">{t("files.propSource")}</span><p className="text-sm capitalize text-foreground">{file.source}</p></div>
        </div>
      </div>
    </div>
  )
}

// ---------- Rename Modal ----------
function RenameModal({ file, onClose, onRename }: { file: DisplayFile; onClose: () => void; onRename: (id: string, newName: string) => void }) {
  const { t } = useI18n()
  const [newName, setNewName] = useState(file.displayName)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.select() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName.trim() && newName !== file.displayName && file.id) onRename(file.id, newName.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} className="w-80 glass rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t("files.rename")}</h3>
        <input ref={inputRef} type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">{t("settings.deleteCancel")}</button>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t("files.rename")}</button>
        </div>
      </form>
    </div>
  )
}

// ---------- Move Modal ----------
function MoveModal({ folders, currentFolderId, onClose, onMove }: { folders: ExplorerFolder[]; currentFolderId: string | null; onClose: () => void; onMove: (folderId: string | null) => void }) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-80 glass rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-foreground">{t("files.moveTitle")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("files.selectDestination")}</p>
        <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-1">
          {/* Root option */}
          <button
            onClick={() => setSelected(null)}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors", selected === null ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}
          >
            <Folder className="size-4" />
            {t("files.rootFolder")}
            {selected === null && <Check className="ml-auto size-4" />}
          </button>
          {folders.filter(f => f.id !== currentFolderId).map((folder) => (
            <button
              key={folder.id}
              onClick={() => setSelected(folder.id)}
              className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors", selected === folder.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}
            >
              <Folder className="size-4 text-yellow-500" />
              {folder.name}
              {selected === folder.id && <Check className="ml-auto size-4" />}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">{t("settings.deleteCancel")}</button>
          <button onClick={() => { onMove(selected); onClose() }} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t("files.move")}</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Delete Confirm Modal ----------
function DeleteConfirmModal({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-80 glass rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10"><AlertTriangle className="size-6 text-destructive" /></div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{t("files.confirmDeleteFiles")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{count} {t("files.selected")}. {t("files.confirmDeleteFilesDesc")}</p>
          </div>
          <div className="flex w-full gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">{t("settings.deleteCancel")}</button>
            <button onClick={() => { onConfirm(); onClose() }} className="flex-1 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">{t("settings.deleteConfirm")}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== MAIN COMPONENT ==========
export function FileExplorer({
  onClose, localFiles, folders, onUploadFile, onDeleteFile, onCreateFolder,
  onRenameFile, onMoveFile, onRenameFolder, onDeleteFolder, onAddFileToChat,
}: FileExplorerProps) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [fileSource, setFileSource] = useState<FileSource>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [bucketFiles, setBucketFiles] = useState<GCSFile[]>([])
  const [bucketFolders, setBucketFolders] = useState<string[]>([])
  const [currentPrefix, setCurrentPrefix] = useState("")
  const [isLoadingBucket, setIsLoadingBucket] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])

  // Current Firestore folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{ id: string | null; name: string }[]>([])

  // Modals
  const [previewFile, setPreviewFile] = useState<DisplayFile | null>(null)
  const [propertiesFile, setPropertiesFile] = useState<DisplayFile | null>(null)
  const [renameFile, setRenameFile] = useState<DisplayFile | null>(null)
  const [renameFolderItem, setRenameFolderItem] = useState<DisplayFile | null>(null)
  const [moveFileIds, setMoveFileIds] = useState<string[]>([])
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Create folder modal
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showCreateFolder) setTimeout(() => folderInputRef.current?.focus(), 50)
  }, [showCreateFolder])

  // --- Folder navigation ---
  const navigateToFirestoreFolder = useCallback((folderId: string | null, folderName?: string) => {
    setCurrentFolderId(folderId)
    setSelectedIds(new Set())
    if (folderId === null) {
      setFolderBreadcrumbs([])
    } else {
      setFolderBreadcrumbs((prev) => {
        const existing = prev.findIndex((b) => b.id === folderId)
        if (existing >= 0) return prev.slice(0, existing + 1)
        return [...prev, { id: folderId, name: folderName || "Folder" }]
      })
    }
  }, [])

  // --- Handlers ---
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault()
    if (newFolderName.trim() && onCreateFolder) {
      onCreateFolder(newFolderName.trim(), currentFolderId || undefined)
    }
    setNewFolderName("")
    setShowCreateFolder(false)
  }

  const handleDirectUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !onUploadFile) return
    // Get existing names in current folder for deduplication
    const existingNames = new Set(
      localFiles.filter((f) => (f.folderId || null) === currentFolderId).map((f) => f.name)
    )
    for (const file of Array.from(e.target.files)) {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(",")[1]
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
        const finalName = deduplicateName(file.name, existingNames)
        existingNames.add(finalName)
        onUploadFile({
          name: finalName,
          mimeType: file.type || "application/octet-stream",
          data: base64,
          previewUrl,
          source: "uploaded",
          timestamp: Date.now(),
          folderId: currentFolderId || undefined,
        })
      }
      reader.readAsDataURL(file)
    }
    if (uploadFileRef.current) uploadFileRef.current.value = ""
  }, [onUploadFile, currentFolderId, localFiles])

  const handleFileDoubleClick = (item: DisplayFile) => {
    if (item.type === "folder") {
      if (item.id) navigateToFirestoreFolder(item.id, item.displayName)
      else navigateToFolder(item.name)
      return
    }
    if (item.mimeType === "application/pdf") {
      const url = getDataUrl(item)
      if (url) window.open(url, "_blank")
      return
    }
    if (item.mimeType.startsWith("image/") || item.mimeType.startsWith("video/") || item.mimeType.startsWith("audio/")) {
      setPreviewFile(item)
      return
    }
    const url = getDataUrl(item)
    if (url) window.open(url, "_blank")
  }

  const handleDownloadFile = useCallback((file: DisplayFile) => {
    const url = getDataUrl(file)
    if (!url) return
    const a = document.createElement("a")
    a.href = url
    a.download = file.displayName
    a.click()
  }, [])

  const handleOpenInNewWindow = useCallback((file: DisplayFile) => {
    const url = getDataUrl(file)
    if (url) window.open(url, "_blank")
  }, [])

  const handleSingleSelect = useCallback((id: string, ctrlKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (ctrlKey) {
        if (next.has(id)) next.delete(id); else next.add(id)
      } else {
        if (next.has(id) && next.size === 1) { next.clear() } else { next.clear(); next.add(id) }
      }
      return next
    })
  }, [])

  // --- Bulk actions ---
  const handleBulkDownload = useCallback(async () => {
    const selectedFiles = allDisplayFiles.filter((f) => f.id && selectedIds.has(f.id) && f.type === "file")
    if (selectedFiles.length === 0) return

    if (selectedFiles.length < 3) {
      // Download individually
      for (const f of selectedFiles) handleDownloadFile(f)
      return
    }

    // ZIP download for 3+
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()
    for (const f of selectedFiles) {
      const url = getDataUrl(f)
      if (!url) continue
      try {
        const resp = await fetch(url)
        const blob = await resp.blob()
        zip.file(f.displayName, blob)
      } catch {
        // skip files that fail to fetch
      }
    }
    const zipBlob = await zip.generateAsync({ type: "blob" })
    const now = new Date()
    const name = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}.zip`
    const a = document.createElement("a")
    a.href = URL.createObjectURL(zipBlob)
    a.download = name
    a.click()
  }, [selectedIds])

  const handleBulkMove = useCallback(() => {
    const ids = Array.from(selectedIds).filter((id) => allDisplayFiles.find((f) => f.id === id && f.type === "file"))
    if (ids.length === 0) return
    setMoveFileIds(ids)
    setShowMoveModal(true)
  }, [selectedIds])

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return
    setShowDeleteConfirm(true)
  }, [selectedIds])

  const confirmBulkDelete = useCallback(() => {
    for (const id of selectedIds) {
      const file = allDisplayFiles.find((f) => f.id === id)
      if (!file) continue
      if (file.type === "folder" && onDeleteFolder) {
        onDeleteFolder(id)
      } else if (file.type === "file" && onDeleteFile) {
        onDeleteFile(id, file.storagePath || "")
      }
    }
    setSelectedIds(new Set())
  }, [selectedIds, onDeleteFile, onDeleteFolder])

  const handleMoveConfirm = useCallback((targetFolderId: string | null) => {
    if (!onMoveFile) return
    // Check for duplicate names in target folder
    const targetFiles = localFiles.filter((f) => (f.folderId || null) === targetFolderId)
    const existingNames = new Set(targetFiles.map((f) => f.name))
    for (const fileId of moveFileIds) {
      const file = localFiles.find((f) => f.id === fileId)
      if (file) {
        const newName = deduplicateName(file.name, existingNames)
        if (newName !== file.name && onRenameFile) {
          onRenameFile(fileId, newName)
        }
        existingNames.add(newName)
      }
      onMoveFile(fileId, targetFolderId)
    }
    setMoveFileIds([])
    setSelectedIds(new Set())
  }, [onMoveFile, onRenameFile, moveFileIds, localFiles])

  // --- Bucket files (GCS) ---
  const fetchBucketFiles = useCallback(async (prefix: string) => {
    setIsLoadingBucket(true)
    try {
      const params = new URLSearchParams()
      if (prefix) params.set("prefix", prefix)
      params.set("delimiter", "/")
      const res = await fetch(`/api/files?${params}`)
      if (res.ok) {
        const data = await res.json()
        setBucketFiles(data.files || [])
        setBucketFolders(data.folders || [])
      }
    } catch { /* ignore */ } finally { setIsLoadingBucket(false) }
  }, [])

  useEffect(() => { fetchBucketFiles(currentPrefix) }, [currentPrefix, fetchBucketFiles])

  const navigateToFolder = (folderPath: string) => {
    setCurrentPrefix(folderPath)
    setBreadcrumbs(folderPath.split("/").filter(Boolean))
  }

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) { setCurrentPrefix(""); setBreadcrumbs([]) }
    else {
      const path = breadcrumbs.slice(0, index + 1).join("/") + "/"
      setCurrentPrefix(path)
      setBreadcrumbs(breadcrumbs.slice(0, index + 1))
    }
  }

  // ---------- Build display files ----------
  const allDisplayFiles: DisplayFile[] = []

  // Firestore folders matching current parent
  const currentFolders = folders.filter((f) => (f.parentId || null) === currentFolderId)
  for (const folder of currentFolders) {
    if (!searchQuery || folder.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      allDisplayFiles.push({
        type: "folder", id: folder.id, name: folder.name, displayName: folder.name,
        mimeType: "folder", size: "", updated: "", source: "folder",
      })
    }
  }

  // GCS bucket folders (only when at root / non-firestore context)
  if (fileSource !== "local" && !currentFolderId) {
    for (const folder of bucketFolders) {
      const folderName = folder.replace(currentPrefix, "").replace("/", "")
      if (folderName && (!searchQuery || folderName.toLowerCase().includes(searchQuery.toLowerCase()))) {
        allDisplayFiles.push({
          type: "folder", name: folder, displayName: folderName,
          mimeType: "folder", size: "", updated: "", source: "bucket",
        })
      }
    }
  }

  // GCS bucket files
  if (fileSource !== "local" && !currentFolderId) {
    for (const file of bucketFiles) {
      const fileName = getFileName(file.name)
      if (!searchQuery || fileName.toLowerCase().includes(searchQuery.toLowerCase())) {
        allDisplayFiles.push({
          type: "file", name: file.name, displayName: fileName,
          mimeType: file.contentType, size: file.size, updated: file.updated, source: "bucket",
        })
      }
    }
  }

  // Local/Firestore files matching current folder
  if (fileSource !== "bucket") {
    const folderFiles = localFiles.filter((f) => (f.folderId || null) === currentFolderId)
    for (const file of folderFiles) {
      if (!searchQuery || file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        allDisplayFiles.push({
          type: "file", id: file.id, name: file.name, displayName: file.name,
          mimeType: file.mimeType, size: file.data ? String(Math.round((file.data.length * 3) / 4)) : "0",
          updated: new Date(file.timestamp).toISOString(), source: file.source,
          data: file.data, previewUrl: file.previewUrl, storagePath: file.storagePath,
          folderId: file.folderId,
        })
      }
    }
  }

  const uploadedCount = localFiles.filter((f) => f.source === "uploaded").length
  const generatedCount = localFiles.filter((f) => f.source === "generated").length

  // --- Context menu for a single file ---
  const renderContextMenu = (item: DisplayFile) => {
    if (item.type === "folder") {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button onClick={(e) => e.stopPropagation()} className="flex size-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted">
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setRenameFolderItem(item)}><Pencil className="mr-2 size-4" />{t("files.rename")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => item.id && onDeleteFolder?.(item.id)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />{t("files.delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button onClick={(e) => e.stopPropagation()} className="flex size-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted">
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => handleOpenInNewWindow(item)}><ExternalLink className="mr-2 size-4" />{t("files.openNewWindow")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownloadFile(item)}><Download className="mr-2 size-4" />{t("files.download")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRenameFile(item)}><Pencil className="mr-2 size-4" />{t("files.rename")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { if (item.id) { setMoveFileIds([item.id]); setShowMoveModal(true) } }}><FolderInput className="mr-2 size-4" />{t("files.move")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPropertiesFile(item)}><Info className="mr-2 size-4" />{t("files.properties")}</DropdownMenuItem>
          {onAddFileToChat && item.id && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                const localFile = localFiles.find((f) => f.id === item.id)
                if (localFile) onAddFileToChat(localFile)
              }}>
                <MessageSquarePlus className="mr-2 size-4" />{t("files.addToChat")}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => item.id && onDeleteFile?.(item.id, item.storagePath || "")} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />{t("files.delete")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // --- Render file row ---
  const renderFileItem = (item: DisplayFile, index: number) => {
    const Icon = item.type === "folder" ? Folder : getFileIcon(item.mimeType)
    const iconColor = item.type === "folder" ? "text-yellow-500" : getFileIconColor(item.mimeType)
    const isSelected = item.id ? selectedIds.has(item.id) : false

    if (viewMode === "grid") {
      return (
        <div
          key={`${item.name}-${index}`}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-4 transition-all hover:bg-muted/50",
            isSelected ? "border-primary bg-primary/5" : "border-transparent"
          )}
          onClick={(e) => item.id && handleSingleSelect(item.id, e.ctrlKey || e.metaKey)}
          onDoubleClick={() => handleFileDoubleClick(item)}
        >
          {item.id && (
            <div className={cn("absolute left-2 top-2 flex size-5 items-center justify-center rounded border transition-all",
              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border opacity-0 group-hover:opacity-100"
            )}>
              {isSelected && <Check className="size-3" />}
            </div>
          )}
          <div className="absolute right-1 top-1">{renderContextMenu(item)}</div>
          {item.type === "file" && item.mimeType.startsWith("image/") && item.previewUrl ? (
            <img src={item.previewUrl} alt={item.displayName} className="size-16 rounded-lg object-cover" crossOrigin="anonymous" />
          ) : (
            <Icon className={cn("size-10", iconColor)} />
          )}
          <span className="w-full truncate text-center text-xs text-foreground">{item.displayName}</span>
        </div>
      )
    }

    return (
      <div
        key={`${item.name}-${index}`}
        className={cn(
          "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50",
          isSelected ? "bg-primary/5" : ""
        )}
        onClick={(e) => item.id && handleSingleSelect(item.id, e.ctrlKey || e.metaKey)}
        onDoubleClick={() => handleFileDoubleClick(item)}
      >
        {item.id && (
          <div className={cn("flex size-5 shrink-0 items-center justify-center rounded border transition-all",
            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border opacity-0 group-hover:opacity-100"
          )}>
            {isSelected && <Check className="size-3" />}
          </div>
        )}
        {item.type === "file" && item.mimeType.startsWith("image/") && item.previewUrl ? (
          <img src={item.previewUrl} alt={item.displayName} className="size-9 shrink-0 rounded-lg object-cover" crossOrigin="anonymous" />
        ) : (
          <Icon className={cn("size-5 shrink-0", iconColor)} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.displayName}</span>
        {item.size && <span className="hidden text-xs text-muted-foreground sm:block">{formatFileSize(item.size)}</span>}
        {item.updated && <span className="hidden text-xs text-muted-foreground md:block">{new Date(item.updated).toLocaleDateString()}</span>}
        {renderContextMenu(item)}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted" aria-label={t("files.backToChat")}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <HardDrive className="size-5 text-primary" />
          <h1 className="text-lg font-medium text-foreground">{t("files.title")}</h1>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* Bulk actions when files selected */}
          {selectedIds.size > 0 ? (
            <>
              <span className="mr-1 text-xs font-medium text-primary">{selectedIds.size} {t("files.selected")}</span>
              <button onClick={handleBulkDownload} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted" title={t("files.downloadSelected")}>
                <Download className="size-4" />
              </button>
              <button onClick={handleBulkMove} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted" title={t("files.moveSelected")}>
                <FolderInput className="size-4" />
              </button>
              <button onClick={handleBulkDelete} className="flex items-center gap-1.5 rounded-full border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10" title={t("files.deleteSelected")}>
                <Trash2 className="size-4" />
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
            </>
          ) : null}
          <button onClick={() => setShowCreateFolder(true)} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <FolderPlus className="size-4" /><span className="hidden sm:inline">{t("files.createFolder")}</span>
          </button>
          <button onClick={() => uploadFileRef.current?.click()} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <Upload className="size-4" /><span className="hidden sm:inline">{t("files.uploadFile")}</span>
          </button>
          <input ref={uploadFileRef} type="file" multiple accept="*/*" onChange={handleDirectUpload} className="hidden" />
          <button onClick={() => fetchBucketFiles(currentPrefix)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <RefreshCw className={cn("size-4", isLoadingBucket && "animate-spin")} />
          </button>
          <button onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            {viewMode === "grid" ? <List className="size-4" /> : <Grid3X3 className="size-4" />}
          </button>
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        {([
          { id: "all" as const, label: "files.all" },
          { id: "bucket" as const, label: "files.cloudStorage", icon: HardDrive },
          { id: "local" as const, label: "files.chatFiles", icon: Sparkles },
        ]).map((tab) => (
          <button key={tab.id} onClick={() => setFileSource(tab.id)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", fileSource === tab.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>
            {tab.icon && <tab.icon className="size-3.5" />}<span>{t(tab.label)}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 pb-1 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={t("files.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground">
        <button onClick={() => { navigateToBreadcrumb(-1); navigateToFirestoreFolder(null) }} className="transition-colors hover:text-foreground">{t("files.root")}</button>
        {folderBreadcrumbs.map((bc, i) => (
          <div key={bc.id || i} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button onClick={() => navigateToFirestoreFolder(bc.id, bc.name)} className="transition-colors hover:text-foreground">{bc.name}</button>
          </div>
        ))}
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button onClick={() => navigateToBreadcrumb(i)} className="transition-colors hover:text-foreground">{crumb}</button>
          </div>
        ))}
        <span className="ml-auto">{allDisplayFiles.length} {t("files.items")} | {uploadedCount} {t("files.uploaded")} | {generatedCount} {t("files.generated")}</span>
      </div>

      {/* File list */}
      <ScrollArea className="flex-1 px-4 pb-4">
        {allDisplayFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <HardDrive className="size-12 opacity-30" />
            <p className="text-sm">{t("files.empty")}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {allDisplayFiles.map((item, i) => renderFileItem(item, i))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {allDisplayFiles.map((item, i) => renderFileItem(item, i))}
          </div>
        )}
      </ScrollArea>

      {/* Modals */}
      {previewFile && <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      {propertiesFile && <PropertiesModal file={propertiesFile} onClose={() => setPropertiesFile(null)} />}
      {renameFile && <RenameModal file={renameFile} onClose={() => setRenameFile(null)} onRename={(id, name) => onRenameFile?.(id, name)} />}
      {renameFolderItem && <RenameModal file={renameFolderItem} onClose={() => setRenameFolderItem(null)} onRename={(id, name) => onRenameFolder?.(id, name)} />}
      {showMoveModal && <MoveModal folders={folders} currentFolderId={currentFolderId} onClose={() => { setShowMoveModal(false); setMoveFileIds([]) }} onMove={handleMoveConfirm} />}
      {showDeleteConfirm && <DeleteConfirmModal count={selectedIds.size} onClose={() => setShowDeleteConfirm(false)} onConfirm={confirmBulkDelete} />}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateFolder(false)}>
          <form onSubmit={handleCreateFolder} className="w-80 glass rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("files.createFolder")}</h3>
              <button type="button" onClick={() => setShowCreateFolder(false)} className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
            </div>
            <input ref={folderInputRef} type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder={t("files.newFolderName")} className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateFolder(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">{t("settings.deleteCancel")}</button>
              <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t("files.create")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
