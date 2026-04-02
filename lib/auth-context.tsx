"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import { has2FAEnabled } from "@/lib/totp"

interface AuthContextValue {
  user: User | null
  loading: boolean
  require2FA: boolean
  offer2FASetup: boolean
  pendingUser: User | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  // 👇 Actualizamos la firma para aceptar el parámetro trustDevice
  complete2FA: (trustDevice?: boolean) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [require2FA, setRequire2FA] = useState(false)
  const [offer2FASetup, setOffer2FASetup] = useState(false)
  const [pendingUser, setPendingUser] = useState<User | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const isSessionVerified = sessionStorage.getItem(`2fa_verified_${firebaseUser.uid}`)
        const hasSkipped = sessionStorage.getItem(`2fa_skip_${firebaseUser.uid}`)

        // 👇 NUEVO: Comprobar si el dispositivo está marcado como confiable
        const trustedUntilStr = localStorage.getItem(`2fa_trusted_${firebaseUser.uid}`)
        const trustedUntil = trustedUntilStr ? parseInt(trustedUntilStr, 10) : 0
        const isDeviceTrusted = Date.now() < trustedUntil

        // Si la sesión actual está verificada O el dispositivo es confiable por 48h
        if (isSessionVerified === "true" || isDeviceTrusted) {
          setUser(firebaseUser)
          setRequire2FA(false)
          setOffer2FASetup(false)
        } else {
          try {
            const enabled = await has2FAEnabled(firebaseUser.uid)
            if (enabled) {
              setPendingUser(firebaseUser)
              setRequire2FA(true)
              setOffer2FASetup(false)
              setUser(null)
            } else if (hasSkipped !== "true") {
              setPendingUser(firebaseUser)
              setOffer2FASetup(true)
              setRequire2FA(false)
              setUser(null)
            } else {
              setUser(firebaseUser)
            }
          } catch (error) {
            console.error("Error validando estado 2FA:", error)
            setUser(firebaseUser)
          }
        }
      } else {
        setUser(null)
        setPendingUser(null)
        setRequire2FA(false)
        setOffer2FASetup(false)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // 👇 NUEVO: Aceptamos si el usuario marcó la casilla de confianza
  const complete2FA = (trustDevice = false) => {
    if (pendingUser) {
      sessionStorage.setItem(`2fa_verified_${pendingUser.uid}`, "true")

      if (trustDevice) {
        // Calculamos 7 días en el futuro (milisegundos)
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
        localStorage.setItem(`2fa_trusted_${pendingUser.uid}`, expiresAt.toString())
      }

      setUser(pendingUser)
      setRequire2FA(false)
      setOffer2FASetup(false)
      setPendingUser(null)
    }
  }

  const googleProvider = new GoogleAuthProvider()

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName && credential.user) {
      await updateProfile(credential.user, { displayName })
    }
  }

  const handleSignInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const logout = async () => {
    // 👇 SEGURIDAD: Si un empleado le da a "Cerrar sesión" explícitamente, 
    // borramos la confianza de 7 días. Así protegemos equipos compartidos en la barbería.
    if (user) {
      localStorage.removeItem(`2fa_trusted_${user.uid}`)
      sessionStorage.removeItem(`2fa_verified_${user.uid}`)
    }
    await signOut(auth)
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, require2FA, offer2FASetup, pendingUser,
      signIn, signUp, signInWithGoogle: handleSignInWithGoogle, logout,
      resetPassword, complete2FA
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}