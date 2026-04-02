import * as OTPAuth from "otpauth"
import QRCode from "qrcode"
import { db } from "./firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"

const ISSUER = "BarbuSportif AI"

/** Check if a user has 2FA enabled */
export async function has2FAEnabled(userId: string): Promise<boolean> {
  const ref = doc(db, `users/${userId}/settings/totp`)
  const snap = await getDoc(ref)
  return snap.exists() && snap.data()?.enabled === true
}

/** Generate a new TOTP secret + QR code for setup */
export async function generate2FASetup(userId: string, userEmail: string) {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: userEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  })

  const secret = totp.secret.base32
  const uri = totp.toString()
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 2 })

  // Store secret (not yet enabled until verified)
  await setDoc(doc(db, `users/${userId}/settings/totp`), {
    secret,
    enabled: false,
    createdAt: new Date().toISOString(),
  })

  return { secret, qrDataUrl }
}

/** Verify a TOTP code and enable 2FA if valid */
export async function verify2FACode(userId: string, code: string): Promise<boolean> {
  const ref = doc(db, `users/${userId}/settings/totp`)
  const snap = await getDoc(ref)
  if (!snap.exists()) return false

  const secret = snap.data().secret
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })

  const delta = totp.validate({ token: code, window: 1 })
  if (delta !== null) {
    // Enable 2FA on first successful verification
    if (!snap.data().enabled) {
      await setDoc(ref, { ...snap.data(), enabled: true }, { merge: true })
    }
    return true
  }
  return false
}

/** Validate a TOTP code for login (returns true if valid or if 2FA not enabled) */
export async function validate2FALogin(userId: string, code: string): Promise<boolean> {
  const enabled = await has2FAEnabled(userId)
  if (!enabled) return true // 2FA not set up, allow login
  return verify2FACode(userId, code)
}
