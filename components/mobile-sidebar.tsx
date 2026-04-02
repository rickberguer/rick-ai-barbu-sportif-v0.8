"use client"

import { PanelLeft } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"
import { GeminiSidebar, type ChatItem } from "@/components/gemini-sidebar"

interface MobileSidebarProps {
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

export function MobileSidebar({ 
  activeChatId, 
  onSelectChat, 
  onNewChat, 
  chatHistory, 
  onDeleteAllChats, 
  onOpenFileExplorer,
  onDeleteChat,
  onRenameChat,
  onToggleFavorite
}: MobileSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted md:hidden"
          aria-label="Open menu"
        >
          <PanelLeft className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="mobile-sidebar-solid w-[280px] p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <GeminiSidebar
          isOpen={true}
          onToggle={() => {}}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          chatHistory={chatHistory}
          onDeleteAllChats={onDeleteAllChats}
          onOpenFileExplorer={onOpenFileExplorer}
          onRenameChat={onRenameChat}
          onDeleteChat={onDeleteChat}
          onToggleFavorite={onToggleFavorite}
        />
      </SheetContent>
    </Sheet>
  )
}
