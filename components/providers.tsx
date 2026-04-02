"use client"

import { useState } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { I18nProvider } from "@/lib/i18n"
import { AuthProvider } from "@/lib/auth-context"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SoundContext } from "@/components/settings-menu"

export function Providers({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState(true)

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
    >
      <I18nProvider>
        <AuthProvider>
          <SoundContext.Provider value={{ soundEnabled, setSoundEnabled }}>
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          </SoundContext.Provider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
