"use client"

import { useState } from "react"
import {
  Search,
  HelpCircle,
  MessageSquare,
  PanelLeft,
  SquarePen,
  FolderOpen,
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
}: GeminiSidebarProps) {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState("")

  const filteredChats = chatHistory.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <aside
      className={cn(
        "glass-sidebar flex h-full flex-col transition-all duration-300 ease-in-out",
        isOpen ? "w-[260px]" : "w-[68px]"
      )}
    >
      {/* Top controls */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggle}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isOpen ? t("sidebar.collapse") : t("sidebar.expand")}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Open state */}
      {isOpen && (
        <>
          {/* New chat button - styled like reference image */}
          <div className="px-3 pt-1 pb-0.5">
            <button
              onClick={onNewChat}
              className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <SquarePen className="size-[18px] text-muted-foreground" />
              <span>{t("sidebar.newChat")}</span>
            </button>
          </div>

          {/* Mis cosas / My files button */}
          {onOpenFileExplorer && (
            <div className="px-3 pb-0.5">
              <button
                onClick={onOpenFileExplorer}
                className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              >
                <FolderOpen className="size-[18px] text-muted-foreground" />
                <span>{t("sidebar.myFiles")}</span>
              </button>
            </div>
          )}

          {/* Search */}
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("sidebar.searchChats")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border-0 bg-transparent py-2 pl-9 pr-3 text-sm text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Chats section label */}
          <div className="px-5 pt-3 pb-1">
            <span className="text-xs font-medium text-muted-foreground">{t("sidebar.chats")}</span>
          </div>

          {/* Chat list */}
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {filteredChats.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {chatHistory.length === 0
                    ? t("sidebar.noConversations")
                    : t("sidebar.noResults")}
                </p>
              ) : (
                filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors",
                      activeChatId === chat.id
                        ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    )}
                  >
                    <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm" title={chat.title}>
                        {chat.title}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Bottom actions */}
          <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-2 py-2">
            <SettingsMenu onDeleteAllChats={onDeleteAllChats} />
          </div>
        </>
      )}

      {/* Collapsed state */}
      {!isOpen && (
        <>
          <div className="flex flex-col items-center gap-1 px-3 pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onNewChat}
                  className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent"
                  aria-label={t("sidebar.newChat")}
                >
                  <SquarePen className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("sidebar.newChat")}</TooltipContent>
            </Tooltip>
            {onOpenFileExplorer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onOpenFileExplorer}
                    className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent"
                  >
                    <FolderOpen className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("sidebar.myFiles")}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent">
                  <Search className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("sidebar.searchChats")}</TooltipContent>
            </Tooltip>
          </div>

          <div className="mt-auto flex flex-col items-center gap-1 border-t border-sidebar-border px-3 py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent">
                  <HelpCircle className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("settings.help")}</TooltipContent>
            </Tooltip>
            <SettingsMenu collapsed onDeleteAllChats={onDeleteAllChats} />
          </div>
        </>
      )}
    </aside>
  )
}
