"use client"

import { useState } from "react"
import {
  Search,
  MessageSquare,
  PanelLeft,
  SquarePen,
  FolderOpen,
  Star,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { SettingsMenu } from "@/components/settings-menu"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface ChatItem {
  id: string
  title: string
  isFavorite?: boolean
}

interface GeminiSidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  chatHistory: ChatItem[]
  onDeleteAllChats?: (keepFiles?: boolean) => Promise<void>
  onOpenFileExplorer?: () => void
  onDeleteChat?: (chatId: string, keepFiles?: boolean) => Promise<void>
  onRenameChat?: (chatId: string, newTitle: string) => Promise<void>
  onToggleFavorite?: (chatId: string) => Promise<void>
}

export function GeminiSidebar({
  isOpen,
  onToggle,
  activeChatId,
  onSelectChat,
  onNewChat,
  chatHistory,
  onDeleteAllChats,
  onOpenFileExplorer,
  onToggleFavorite,
}: GeminiSidebarProps) {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState("")

  const filtered = chatHistory.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const favorites = filtered.filter((c) => c.isFavorite)
  const regular = filtered.filter((c) => !c.isFavorite)

  return (
    <aside
      className={cn(
        "glass-sidebar flex h-full flex-col transition-all duration-300 ease-in-out",
        isOpen ? "w-[268px]" : "w-[68px]"
      )}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center px-3 pt-4 pb-3",
        isOpen ? "gap-2" : "flex-col gap-2"
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggle}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isOpen ? t("sidebar.collapse") : t("sidebar.expand")}
          </TooltipContent>
        </Tooltip>

        {/* New chat — icon-only in collapsed, icon+label in open */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onNewChat}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-xl font-medium transition-all hover:scale-105 active:scale-95",
                isOpen
                  ? "ml-auto size-9 bg-primary/10 text-primary hover:bg-primary/20"
                  : "size-9 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
              aria-label={t("sidebar.newChat")}
            >
              <SquarePen className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("sidebar.newChat")}</TooltipContent>
        </Tooltip>
      </div>

      {/* ── OPEN STATE ───────────────────────────────────────────────── */}
      {isOpen && (
        <>
          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                placeholder={t("sidebar.searchChats")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border/30 bg-muted/25 py-2 pl-8 pr-3 text-xs text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 focus:bg-muted/40 transition-all"
              />
            </div>
          </div>

          {/* Files shortcut */}
          {onOpenFileExplorer && (
            <div className="px-3 pb-2">
              <button
                onClick={onOpenFileExplorer}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span>{t("sidebar.myFiles")}</span>
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="mx-3 mb-1 border-t border-sidebar-border/50" />

          {/* Chat list */}
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="flex flex-col pb-4">

              {/* Favorites section */}
              {favorites.length > 0 && (
                <div className="mb-1">
                  <SectionLabel
                    icon={<Star className="size-3 fill-amber-400 text-amber-400" />}
                    label={t("sidebar.favorites")}
                  />
                  <div className="flex flex-col gap-0.5 px-2">
                    {favorites.map((chat, i) => (
                      <ChatRow
                        key={chat.id}
                        chat={chat}
                        isActive={activeChatId === chat.id}
                        onSelect={() => onSelectChat(chat.id)}
                        onToggleFavorite={() => onToggleFavorite?.(chat.id)}
                        index={i}
                      />
                    ))}
                  </div>
                  <div className="mx-3 mt-2 mb-1 border-t border-sidebar-border/40" />
                </div>
              )}

              {/* Regular chats */}
              {regular.length > 0 && (
                <div>
                  <SectionLabel
                    icon={<MessageSquare className="size-3 text-muted-foreground/50" />}
                    label={t("sidebar.chats")}
                    count={regular.length}
                  />
                  <div className="flex flex-col gap-0.5 px-2">
                    {regular.map((chat, i) => (
                      <ChatRow
                        key={chat.id}
                        chat={chat}
                        isActive={activeChatId === chat.id}
                        onSelect={() => onSelectChat(chat.id)}
                        onToggleFavorite={() => onToggleFavorite?.(chat.id)}
                        index={i}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted/40">
                    <MessageSquare className="size-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs text-muted-foreground/60 leading-relaxed">
                    {chatHistory.length === 0
                      ? t("sidebar.noConversations")
                      : t("sidebar.noResults")}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Bottom: settings */}
          <div className="flex items-center border-t border-sidebar-border px-2 py-2">
            <SettingsMenu onDeleteAllChats={onDeleteAllChats} />
          </div>
        </>
      )}

      {/* ── COLLAPSED STATE ───────────────────────────────────────────── */}
      {!isOpen && (
        <>
          {/* Files icon */}
          {onOpenFileExplorer && (
            <div className="flex flex-col items-center px-3 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onOpenFileExplorer}
                    className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent"
                  >
                    <FolderOpen className="size-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("sidebar.myFiles")}</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Mini avatar list of recent chats */}
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="flex flex-col items-center gap-1 px-2 py-1">
              {chatHistory.slice(0, 10).map((chat) => (
                <Tooltip key={chat.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectChat(chat.id)}
                      className={cn(
                        "relative flex size-9 items-center justify-center rounded-xl text-[11px] font-bold uppercase transition-all",
                        activeChatId === chat.id
                          ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                          : "bg-muted/35 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                      )}
                    >
                      {chat.title.charAt(0)}
                      {chat.isFavorite && (
                        <span className="absolute -top-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full bg-amber-400">
                          <Star className="size-1.5 fill-white text-white" />
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{chat.title}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </ScrollArea>

          <div className="mt-auto flex flex-col items-center gap-1 border-t border-sidebar-border px-3 py-2">
            <SettingsMenu collapsed onDeleteAllChats={onDeleteAllChats} />
          </div>
        </>
      )}
    </aside>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <div className="flex items-center gap-1.5 px-4 pb-1 pt-2">
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span className="ml-auto rounded-full bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
          {count}
        </span>
      )}
    </div>
  )
}

// ── Chat row ──────────────────────────────────────────────────────────────────
function ChatRow({
  chat,
  isActive,
  onSelect,
  onToggleFavorite,
  index,
}: {
  chat: ChatItem
  isActive: boolean
  onSelect: () => void
  onToggleFavorite: () => void
  index: number
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all duration-150",
        "opacity-0",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground font-medium shadow-sm"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
      style={{
        animation: `sidebarItemIn 0.25s cubic-bezier(0.16,1,0.3,1) ${index * 25}ms forwards`,
      }}
    >
      {/* Active bar */}
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />
      )}

      <div className="flex-1 min-w-0">
        <p className="truncate text-[12.5px] leading-snug" title={chat.title}>
          {chat.title}
        </p>
      </div>

      {/* Star toggle */}
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        className={cn(
          "shrink-0 rounded p-0.5 transition-all",
          chat.isFavorite
            ? "text-amber-400 opacity-100"
            : "text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-amber-400"
        )}
      >
        <Star className={cn("size-3", chat.isFavorite && "fill-amber-400")} />
      </span>
    </button>
  )
}
