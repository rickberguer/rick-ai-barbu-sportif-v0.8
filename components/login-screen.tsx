"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { useI18n, type Locale } from "@/lib/i18n"
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react"
import { generate2FASetup, verify2FACode } from "@/lib/totp"
import { auth } from "@/lib/firebase"
import { signOut } from "firebase/auth"

type LoginView = "login" | "forgot" | "2fa-verify" | "2fa-setup"

export function LoginScreen() {
  // Extraemos las nuevas funciones y estados del AuthContext
  const { signIn, resetPassword, require2FA, offer2FASetup, pendingUser, complete2FA } = useAuth()
  const { t, locale, setLocale } = useI18n()

  const [view, setView] = useState<LoginView>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [totpCode, setTotpCode] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const totpInputRef = useRef<HTMLInputElement>(null)
  const [trustDevice, setTrustDevice] = useState(false)

  // 1. Efecto automático: Si AuthContext dice que se requiere 2FA, cambiamos la vista
  useEffect(() => {
    if (require2FA && pendingUser) {
      setView("2fa-verify")
    } else if (offer2FASetup && pendingUser) {
      setView("2fa-setup")
      // Generamos el QR para la pantalla de setup
      const userEmail = pendingUser.email || ""
      generate2FASetup(pendingUser.uid, userEmail).then(({ qrDataUrl: qr }) => {
        setQrDataUrl(qr)
      })
    }
  }, [require2FA, offer2FASetup, pendingUser])

  // Enfocar el input del código 2FA automáticamente
  useEffect(() => {
    if ((view === "2fa-verify" || view === "2fa-setup") && totpInputRef.current) {
      setTimeout(() => totpInputRef.current?.focus(), 100)
    }
  }, [view])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)

    try {
      if (view === "login") {
        await signIn(email, password)
        // Ya no hacemos signOut ni comprobamos el TOTP aquí. AuthContext lo detectará.
      } else if (view === "forgot") {
        await resetPassword(email)
        setSuccess(t("login.resetSent"))
      }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string }
      const code = firebaseError?.code || ""
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setError(t("login.errorInvalid"))
      } else if (code === "auth/too-many-requests") {
        setError(t("login.errorTooMany"))
      } else {
        setError(t("login.errorGeneric"))
      }
    } finally {
      // Solo quitamos el loading si hay error. Si el login es exitoso, AuthContext cambiará la vista.
      setLoading(false)
    }
  }

  const handle2FAVerify = async () => {
    if (!pendingUser) return;
    setError("")
    setLoading(true)
    try {
      const valid = await verify2FACode(pendingUser.uid, totpCode)
      if (valid) {
        complete2FA(trustDevice) // Autenticación completada, ¡liberamos al usuario al dashboard!
      } else {
        setError(t("login.2fa.errorInvalid"))
      }
    } catch {
      setError(t("login.errorGeneric"))
    } finally {
      setLoading(false)
    }
  }

  const handle2FASetupVerify = async () => {
    if (!pendingUser) return;
    setError("")
    setLoading(true)
    try {
      const valid = await verify2FACode(pendingUser.uid, totpCode)
      if (valid) {
        complete2FA(trustDevice)
      } else {
        setError(t("login.2fa.errorInvalid"))
      }
    } catch {
      setError(t("login.errorGeneric"))
    } finally {
      setLoading(false)
    }
  }

  const handle2FASkip = async () => {
    // VULNERABILIDAD CORREGIDA: En lugar de saltar, cerramos la sesión.
    setLoading(true)
    await signOut(auth)
  }

  const handleCancel2FA = async () => {
    // Si el usuario se arrepiente y quiere volver atrás, cerramos la sesión pendiente en Firebase
    await signOut(auth)
    setView("login")
    setError("")
    setTotpCode("")
  }

  const langOptions: { code: Locale; label: string }[] = [
    { code: "fr-CA", label: "FR" },
    { code: "en-CA", label: "EN" },
    { code: "es-MX", label: "MX" },
  ]

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden">
      {/* Video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src="/video-login.mp4"
        aria-hidden="true"
      />

      {/* Dark glass overlay */}
      <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-md" />

      {/* Main content */}
      <div className="relative z-20 flex w-full max-w-md flex-col items-center px-6 py-12">
        {/* Logo */}
        <h1
          className="mb-2 text-center font-sans text-4xl font-bold tracking-tight text-white sm:text-5xl"
          style={{
            backgroundImage: "linear-gradient(135deg, #ffffff 0%, #8ab4f8 50%, #ffffff 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 4s linear infinite",
          }}
        >
          BarbuSportif AI
        </h1>

        {/* Subtitle */}
        <p className="mb-10 text-center text-base text-gray-300">
          {view === "forgot"
            ? t("login.subtitleForgot")
            : view === "2fa-verify"
              ? t("login.2fa.title")
              : view === "2fa-setup"
                ? t("login.2fa.setup")
                : t("login.subtitle")}
        </p>

        {/* 2FA VERIFY VIEW */}
        {view === "2fa-verify" && (
          <div className="flex w-full flex-col items-center gap-5">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <ShieldCheck className="size-8 text-blue-400" />
            </div>
            <p className="text-center text-sm text-gray-400">{t("login.2fa.enterCode")}</p>
            <input
              ref={totpInputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("login.2fa.codePlaceholder")}
              className="h-14 w-48 rounded-xl border border-white/10 bg-white/5 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder-gray-600 outline-none focus:border-white/30 focus:bg-white/10"
            />
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">{error}</p>
            )}
            {/* Checkbox de Confianza */}
            <label className="flex w-full cursor-pointer items-center justify-center gap-3 py-2 text-sm text-gray-400 transition-colors hover:text-gray-300">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="size-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-1 focus:ring-blue-500/50 focus:ring-offset-0"
              />
              {t("login.2fa.trustDevice")}
            </label>
            <button
              onClick={handle2FAVerify}
              disabled={loading || totpCode.length !== 6}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-medium text-gray-900 transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-60"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("login.2fa.verify")}
            </button>
            <button
              onClick={handleCancel2FA}
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              {t("login.backToLogin")}
            </button>
          </div>
        )}

        {/* 2FA SETUP VIEW */}
        {view === "2fa-setup" && (
          <div className="flex w-full flex-col items-center gap-5">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <ShieldCheck className="size-8 text-blue-400" />
            </div>
            <p className="text-center text-sm text-gray-400">{t("login.2fa.scanQR")}</p>
            {qrDataUrl && (
              <div className="rounded-xl border border-white/10 bg-white p-2">
                <img src={qrDataUrl} alt="QR Code" className="size-48" />
              </div>
            )}
            <input
              ref={totpInputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("login.2fa.codePlaceholder")}
              className="h-14 w-48 rounded-xl border border-white/10 bg-white/5 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder-gray-600 outline-none focus:border-white/30 focus:bg-white/10"
            />
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">{error}</p>
            )}
            {/* Checkbox de Confianza */}
            <label className="flex w-full cursor-pointer items-center justify-center gap-3 py-2 text-sm text-gray-400 transition-colors hover:text-gray-300">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="size-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-1 focus:ring-blue-500/50 focus:ring-offset-0"
              />
              {t("login.2fa.trustDevice")}
            </label>
            <button
              onClick={handle2FASetupVerify}
              disabled={loading || totpCode.length !== 6}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-medium text-gray-900 transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-60"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("login.2fa.verify")}
            </button>
            <button
              onClick={handle2FASkip}
              disabled={loading}
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              {t("login.2fa.skip")}
            </button>
          </div>
        )}

        {/* LOGIN / FORGOT FORM */}
        {(view === "login" || view === "forgot") && (
          <>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                  {t("login.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  autoComplete="email"
                  className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder-gray-500 outline-none ring-0 transition-colors focus:border-white/30 focus:bg-white/10"
                />
              </div>

              {/* Password */}
              {view !== "forgot" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                    {t("login.password")}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("login.passwordPlaceholder")}
                      autoComplete="current-password"
                      className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 pr-12 text-sm text-white placeholder-gray-500 outline-none ring-0 transition-colors focus:border-white/30 focus:bg-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">{error}</p>
              )}
              {success && (
                <p className="rounded-lg bg-green-500/10 px-3 py-2 text-center text-xs text-green-400">{success}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-medium text-gray-900 transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-60"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {view === "forgot" ? t("login.sendReset") : t("login.signIn")}
              </button>
            </form>

            <div className="mt-6 flex flex-col items-center gap-3">
              {view === "login" && (
                <button
                  type="button"
                  onClick={() => { setView("forgot"); setError(""); setSuccess("") }}
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  {t("login.forgotPassword")}
                </button>
              )}
              {view === "forgot" && (
                <button
                  type="button"
                  onClick={() => { setView("login"); setError(""); setSuccess("") }}
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  {t("login.backToLogin")}
                </button>
              )}
            </div>
          </>
        )}

        {/* Language selector */}
        <div className="mt-12 flex items-center gap-0">
          {langOptions.map((opt, i) => (
            <span key={opt.code} className="flex items-center">
              <button
                type="button"
                onClick={() => setLocale(opt.code)}
                className={`px-2 py-1 text-xs font-medium tracking-wider transition-colors ${locale === opt.code ? "text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
              >
                {opt.label}
              </button>
              {i < langOptions.length - 1 && <span className="text-xs text-gray-600">|</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
