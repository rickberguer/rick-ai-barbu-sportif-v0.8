"use client"

import { useState, createContext, useContext } from "react"
import {
  Settings,
  Sun,
  Moon,
  Globe,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  Phone,
  Mail,
  Trash2,
  Volume2,
  VolumeX,
  Type,
  AlertTriangle,
} from "lucide-react"
import { useTheme } from "next-themes"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover" // Manteniendo las importaciones originales de Popover
import { useI18n, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Sound context so other components can read whether sound is enabled
const SoundContext = createContext<{ soundEnabled: boolean; setSoundEnabled: (v: boolean) => void }>({
  soundEnabled: true,
  setSoundEnabled: () => {},
})

export function useSoundSetting() {
  return useContext(SoundContext)
}

export { SoundContext }

type SubMenu = null | "theme" | "language" | "help" | "font-size" | "confirm-delete"

interface SettingsMenuProps {
  collapsed?: boolean
  onDeleteAllChats?: (keepFiles?: boolean) => void
}

const locales: Locale[] = ["fr-CA", "en-CA", "es-MX"]

export function SettingsMenu({ collapsed = false, onDeleteAllChats }: SettingsMenuProps) {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const [subMenu, setSubMenu] = useState<SubMenu>(null)
  const soundCtx = useSoundSetting()
  const [fontSize, setFontSize] = useState<string>("medium")
  const [keepFilesOnDelete, setKeepFilesOnDelete] = useState(true)

  const handleLanguageChange = (code: Locale) => {
    setLocale(code)
    setSubMenu(null)
  }

  const handleFontSizeChange = (size: string) => {
    setFontSize(size)
    const sizeMap: Record<string, string> = {
      small: "14px",
      medium: "16px",
      large: "18px",
    }
    document.documentElement.style.fontSize = sizeMap[size] ?? "16px"
    setSubMenu(null)
  }

  const fontSizeKey = fontSize === "small" ? "settings.fontSmall" : fontSize === "large" ? "settings.fontLarge" : "settings.fontMedium"

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setSubMenu(null)
      }}
    >
      <PopoverTrigger asChild>
        {collapsed ? (
          <button
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent"
            aria-label={t("settings.title")}
          >
            <Settings className="size-5" />
          </button>
        ) : (
          <button className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <Settings className="size-[18px]" />
            <span>{t("settings.title")}</span>
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="glass w-[300px] rounded-xl p-0 shadow-xl"
      >
        {/* Main menu */}
        {subMenu === null && (
          <div className="flex flex-col py-2">
            {/* Theme */}
            <button
              onClick={() => setSubMenu("theme")}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              {theme === "light" ? (
                <Sun className="size-5 text-muted-foreground" />
              ) : (
                <Moon className="size-5 text-muted-foreground" />
              )}
              <span className="flex-1 text-left">{t("settings.theme")}</span>
              <span className="text-xs text-muted-foreground">
                {theme === "light" ? t("settings.themeLight") : t("settings.themeDark")}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>

            {/* Language */}
            <button
              onClick={() => setSubMenu("language")}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              <Globe className="size-5 text-muted-foreground" />
              <span className="flex-1 text-left">{t("settings.language")}</span>
              <span className="max-w-[80px] truncate text-xs text-muted-foreground">
                {t(`lang.${locale}`)}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>

            <div className="mx-4 my-1 h-px bg-border" />

            {/* Font size */}
            <button
              onClick={() => setSubMenu("font-size")}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              <Type className="size-5 text-muted-foreground" />
              <span className="flex-1 text-left">{t("settings.fontSize")}</span>
              <span className="text-xs text-muted-foreground">
                {t(fontSizeKey)}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>

            {/* Sound toggle */}
            <button
              onClick={() => soundCtx.setSoundEnabled(!soundCtx.soundEnabled)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              {soundCtx.soundEnabled ? (
                <Volume2 className="size-5 text-muted-foreground" />
              ) : (
                <VolumeX className="size-5 text-muted-foreground" />
              )}
              <span className="flex-1 text-left">{t("settings.sounds")}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  soundCtx.soundEnabled
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {soundCtx.soundEnabled ? "ON" : "OFF"}
              </span>
            </button>

            <div className="mx-4 my-1 h-px bg-border" />

            {/* Delete all chats - goes to confirmation */}
            {onDeleteAllChats && (
              <button
                onClick={() => setSubMenu("confirm-delete")}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-muted"
              >
                <Trash2 className="size-5" />
                <span className="flex-1 text-left">{t("settings.deleteAll")}</span>
              </button>
            )}

            <div className="mx-4 my-1 h-px bg-border" />

            {/* Help */}
            <button
              onClick={() => setSubMenu("help")}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              <HelpCircle className="size-5 text-muted-foreground" />
              <span className="flex-1 text-left">{t("settings.help")}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Delete confirmation submenu */}
        {subMenu === "confirm-delete" && (
          <div className="flex flex-col items-center gap-4 px-6 py-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{t("settings.deleteConfirmTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("settings.deleteConfirmDesc")}</p>
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
                onClick={() => setSubMenu(null)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t("settings.deleteCancel")}
              </button>
              <button
                onClick={() => {
                  onDeleteAllChats?.(keepFilesOnDelete)
                  setSubMenu(null)
                }}
                className="flex-1 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                {t("settings.deleteConfirm")}
              </button>
            </div>
          </div>
        )}

        {/* Theme submenu */}
        {subMenu === "theme" && (
          <div className="flex flex-col py-2">
            <button
              onClick={() => setSubMenu(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
              <span>{t("settings.theme")}</span>
            </button>
            <div className="mx-4 my-1 h-px bg-border" />
            <button
              onClick={() => { setTheme("light"); setSubMenu(null) }}
              className={cn("flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted", theme === "light" ? "text-primary font-medium" : "text-popover-foreground")}
            >
              <Sun className="size-5 text-muted-foreground" />
              <span className="flex-1 text-left">{t("settings.themeLight")}</span>
              {theme === "light" && <span className="size-2 rounded-full bg-primary" />}
            </button>
            <button
              onClick={() => { setTheme("dark"); setSubMenu(null) }}
              className={cn("flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted", theme === "dark" ? "text-primary font-medium" : "text-popover-foreground")}
            >
              <Moon className="size-5 text-muted-foreground" />
              <span className="flex-1 text-left">{t("settings.themeDark")}</span>
              {theme === "dark" && <span className="size-2 rounded-full bg-primary" />}
            </button>
          </div>
        )}

        {/* Language submenu */}
        {subMenu === "language" && (
          <div className="flex flex-col py-2">
            <button
              onClick={() => setSubMenu(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
              <span>{t("settings.language")}</span>
            </button>
            <div className="mx-4 my-1 h-px bg-border" />
            {locales.map((code) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted",
                  locale === code ? "text-primary font-medium" : "text-popover-foreground"
                )}
              >
                <Globe className="size-5 text-muted-foreground" />
                <span className="flex-1 text-left">{t(`lang.${code}`)}</span>
                {locale === code && <span className="size-2 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* Font size submenu */}
        {subMenu === "font-size" && (
          <div className="flex flex-col py-2">
            <button
              onClick={() => setSubMenu(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
              <span>{t("settings.fontSize")}</span>
            </button>
            <div className="mx-4 my-1 h-px bg-border" />
            {(["small", "medium", "large"] as const).map((size) => {
              const key = size === "small" ? "settings.fontSmall" : size === "large" ? "settings.fontLarge" : "settings.fontMedium"
              return (
                <button
                  key={size}
                  onClick={() => handleFontSizeChange(size)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted",
                    fontSize === size ? "text-primary font-medium" : "text-popover-foreground"
                  )}
                >
                  <Type className="size-5 text-muted-foreground" />
                  <span className="flex-1 text-left">{t(key)}</span>
                  {fontSize === size && <span className="size-2 rounded-full bg-primary" />}
                </button>
              )
            })}
          </div>
        )}

        {/* Help submenu */}
        {subMenu === "help" && (
          <div className="flex flex-col py-2">
            <button
              onClick={() => setSubMenu(null)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-popover-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
              <span>{t("settings.help")}</span>
            </button>
            <div className="mx-4 my-1 h-px bg-border" />
            <a
              href="tel:+14383689271"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              <Phone className="size-5 text-muted-foreground" />
              <div className="flex flex-1 flex-col items-start">
                <span>{t("settings.phone")}</span>
                <span className="text-xs text-primary">+1 (438) 368-9271</span>
              </div>
            </a>
            <a
              href="mailto:marketing@barbusportif.ca"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground transition-colors hover:bg-muted"
            >
              <Mail className="size-5 text-muted-foreground" />
              <div className="flex flex-1 flex-col items-start">
                <span>{t("settings.email")}</span>
                <span className="text-xs text-primary">marketing@barbusportif.ca</span>
              </div>
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
