import { VisionPanel } from "@/components/dashboard/vision-panel"
import { GeminiSidebar } from "@/components/gemini-sidebar"
import { GeminiHeader } from "@/components/gemini-header"
import { DashboardTabs } from "@/components/dashboard-tabs"

export default function VisionDashboardPage() {
  return (
    <div className="glass-bg flex h-dvh overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col relative">
        <header className="bg-transparent flex h-14 shrink-0 items-center justify-between px-4 z-20">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-foreground">
              BarbuSportif AI <span className="text-primary font-normal">| Smart Vision</span>
            </span>
          </div>
        </header>
        
        <div className="flex-1 overflow-hidden relative">
          <VisionPanel />
        </div>
      </main>
    </div>
  )
}
