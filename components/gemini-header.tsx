"use client"

import { useState, useRef, useEffect } from "react"
import {
  MoreVertical,
  LogOut,
  Loader2,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"

interface GeminiHeaderProps {
  chatTitle: string
  activeChatId?: string | null
  onRenameChat?: (chatId: string, newTitle: string) => Promise<void>
  onDeleteChat?: (chatId: string, keepFiles?: boolean) => Promise<void>
  onToggleFavorite?: (chatId: string) => Promise<void>
  isFavorite?: boolean
}

export function GeminiHeader({ chatTitle, activeChatId, onRenameChat, onDeleteChat }: GeminiHeaderProps) {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Rename modal state
  const [showRename, setShowRename] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [keepFilesOnDelete, setKeepFilesOnDelete] = useState(true)

  const userName = user?.displayName || user?.email?.split("@")[0] || "User"
  const userEmail = user?.email || ""
  const userInitials = userName.slice(0, 2).toUpperCase()

  const avatarColor = `hsl(${(userName.charCodeAt(0) * 7 + (userName.charCodeAt(1) || 0) * 13) % 360}, 65%, 45%)`

  const handleLogout = async () => {
    setLoggingOut(true)
    setProfileOpen(false)
    await new Promise((r) => setTimeout(r, 300))
    await logout()
  }

  const handleOpenRename = () => {
    setRenameValue(chatTitle)
    setShowRename(true)
  }

  useEffect(() => {
    if (showRename) {
      setTimeout(() => renameInputRef.current?.select(), 50)
    }
  }, [showRename])

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (renameValue.trim() && activeChatId && onRenameChat) {
      onRenameChat(activeChatId, renameValue.trim())
    }
    setShowRename(false)
  }

  const handleDeleteConfirm = () => {
    if (activeChatId && onDeleteChat) {
      onDeleteChat(activeChatId, keepFilesOnDelete)
    }
    setShowDeleteConfirm(false)
  }

  return (
    <>
      {/* Logout overlay */}
      {loggingOut && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">{t("profile.loggingOut")}</span>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowRename(false)}>
          <form onSubmit={handleRenameSubmit} className="glass w-80 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("header.renameTitle")}</h3>
              <button type="button" onClick={() => setShowRename(false)} className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t("header.renamePlaceholder")}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowRename(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">
                {t("settings.deleteCancel")}
              </button>
              <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {t("header.renameSave")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="glass w-80 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{t("settings.deleteSingleTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("settings.deleteSingleDesc")}</p>
              </div>
              <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={keepFilesOnDelete}
                  onChange={(e) => setKeepFilesOnDelete(e.target.checked)}
                  className="size-4 rounded border-border accent-primary"
                />
                <span className="text-xs text-foreground">{t("settings.keepFiles")}</span>
              </label>
              <div className="flex w-full gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {t("settings.deleteCancel")}
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                  {t("settings.deleteConfirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex shrink-0 items-center justify-end gap-1">
        <span className="mr-auto max-w-32 truncate text-xs text-muted-foreground md:max-w-none md:text-sm">{chatTitle}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              aria-label={t("header.moreOptions")}
            >
              <MoreVertical className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={!activeChatId}
              onClick={handleOpenRename}
            >
              <Pencil className="mr-2 size-4" />
              {t("header.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!activeChatId}
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              {t("header.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Popover */}
        <Popover open={profileOpen} onOpenChange={setProfileOpen}>
          <PopoverTrigger asChild>
            <button className="ml-1 rounded-full ring-2 ring-transparent transition-all hover:ring-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="size-8 cursor-pointer">
                <AvatarFallback
                  className="text-xs font-semibold text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="glass w-72 rounded-2xl p-0 shadow-lg"
          >
            <div className="flex flex-col items-center gap-3 border-b border-border px-6 pt-6 pb-4">
              <Avatar className="size-16 ring-2 ring-border">
                <AvatarFallback
                  className="text-lg font-bold text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-sm font-semibold text-foreground">{userName}</span>
                <span className="text-xs text-muted-foreground">{userEmail}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1 p-3">
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="size-4" />
                <span>{t("profile.logout")}</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </header>
    </>
  )
}
