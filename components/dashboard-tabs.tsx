"use client"

import {
  MessageSquare,
  DollarSign,
  LineChart,
  Users,
  Briefcase,
  Megaphone,
  FileBarChart,
  Lightbulb,
  Wallet,
  Eye,
  Package,
} from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type DashboardPanelType = 
  | 'chat'
  | 'financial'
  | 'traffic'
  | 'competitors'
  | 'accounting'
  | 'marketing'
  | 'reports'
  | 'recommendations'
  | 'cash-report'
  | 'vision'
  | 'inventory'

interface DashboardTabsProps {
  activePanel: DashboardPanelType;
  notifications?: Record<string, boolean>;
  onChangePanel: (panel: DashboardPanelType) => void;
}

const TABS = [
  { id: 'chat' as const, icon: MessageSquare, labelKey: 'panel.chat' },
  { id: 'financial' as const, icon: DollarSign, labelKey: 'panel.financial' },
  { id: 'traffic' as const, icon: LineChart, labelKey: 'panel.traffic' },
  { id: 'competitors' as const, icon: Users, labelKey: 'panel.competitors' },
  { id: 'accounting' as const, icon: Briefcase, labelKey: 'panel.accounting', disabled: true },
  { id: 'marketing' as const, icon: Megaphone, labelKey: 'panel.marketing' },
  { id: 'reports' as const, icon: FileBarChart, labelKey: 'panel.reports' },
  { id: 'cash-report' as const, icon: Wallet, labelKey: 'panel.cashReport' },
  { id: 'vision' as const, icon: Eye, labelKey: 'panel.vision' },
  { id: 'inventory' as const, icon: Package, labelKey: 'panel.inventory' },
  { id: 'recommendations' as const, icon: Lightbulb, labelKey: 'panel.recommendations' },
];

export function DashboardTabs({ activePanel, notifications, onChangePanel }: DashboardTabsProps) {
  const { t } = useI18n()

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-4 md:top-1/2 md:-translate-y-1/2 flex flex-row md:flex-col gap-2 rounded-2xl border border-border/50 bg-background/40 p-2 shadow-xl backdrop-blur-md dark:bg-background/20 z-50 transition-all max-w-[95vw] overflow-x-auto md:overflow-visible">
      {TABS.map((tab) => {
        const isActive = activePanel === tab.id;
        const isDisabled = 'disabled' in tab && tab.disabled;
        const hasNotification = notifications?.[tab.id];

        return (
          <Tooltip key={tab.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                onClick={() => !isDisabled && onChangePanel(tab.id)}
                disabled={isDisabled}
                className={cn(
                  "group relative flex size-10 items-center justify-center rounded-xl transition-all duration-300",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)] scale-110"
                    : isDisabled 
                      ? "opacity-40 grayscale cursor-not-allowed cursor-not-allowed" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-label={t(tab.labelKey)}
              >
                <tab.icon className={cn("size-5 transition-transform duration-300", isActive && "scale-110")} />
                {hasNotification && (
                  <span className="absolute top-1 right-1 size-2 bg-red-500 rounded-full border border-background animate-pulse" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-medium">
              {t(tab.labelKey)} {isDisabled && (t("panel.comingSoon") || "(Próximamente)")}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  )
}
