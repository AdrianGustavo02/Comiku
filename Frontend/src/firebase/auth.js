import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from './firebase'

const passwordPolicyMessage =
  'La contraseña debe tener al menos 6 caracteres y al menos 1 numero.'

function getBackendBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
}

export function validatePassword(password) {
  const hasMinimumLength = password.length >= 6
  const hasNumber = /\d/.test(password)

  if (!hasMinimumLength || !hasNumber) {
    return {
      valid: false,
      message: passwordPolicyMessage,
    }
  }

  return {
    valid: true,
    message: '',
  }
}

function ensureAuthReady() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.')
  }
}

function mapAuthError(error) {
  const code = error?.code

  if (code === 'auth/email-already-in-use') {
    return 'Ese correo ya está registrado. Inicia sesión o usa otro correo.'
  }

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-email'
  ) {
    return 'Correo o contraseña incorrectos.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  }

  return 'Ocurrió un error al autenticar. Intenta nuevamente.'
}

export async function registerWithEmail({ email, password }) {
  ensureAuthReady()

  const emailBlocked = await isEmailBlockedForRegistration(email)

  if (emailBlocked) {
    throw new Error('Este correo fue bloqueado y no puede volver a registrarse.')
  }

  try {
    const credentials = await createUserWithEmailAndPassword(auth, email, password)

    try {
      await sendEmailVerification(credentials.user)
    } catch {
      // El registro no debe fallar si no se pudo enviar el email de verificación.
    }

    return credentials.user
  } catch (error) {
    throw new Error(mapAuthError(error))
  }
}

export async function isEmailRegistered(email) {
  ensureAuthReady()

  try {
    const signInMethods = await fetchSignInMethodsForEmail(auth, email)
    return signInMethods.length > 0
  } catch (error) {
    throw new Error(mapAuthError(error))
  }
}

export async function isEmailBlockedForRegistration(email) {
  const sanitizedEmail = String(email || '').trim().toLowerCase()

  if (!sanitizedEmail) {
    return false
  }

  const backendBaseUrl = getBackendBaseUrl()

  let response

  try {
    response = await fetch(`${backendBaseUrl}/api/auth/validate-registration-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: sanitizedEmail }),
    })
  } catch {
    throw new Error(
      `No se pudo conectar con el backend (${backendBaseUrl}). Verifica que el servidor esté levantado.`,
    )
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || 'No fue posible validar el correo para registro.')
  }

  return Boolean(payload?.blocked)
}

export async function loginWithEmail({ email, password }) {
  ensureAuthReady()

  try {
    const credentials = await signInWithEmailAndPassword(auth, email, password)
    return credentials.user
  } catch (error) {
    throw new Error(mapAuthError(error))
  }
}

export async function logout() {
  ensureAuthReady()
  await signOut(auth)
}

export function subscribeToAuthChanges(callback) {
  if (!auth) {
    callback(null)
    return () => {}
  }

  return onAuthStateChanged(auth, callback)
}
