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

  if (code === 'auth/requires-recent-login') {
    return 'Por seguridad, vuelve a iniciar sesión antes de cambiar el correo.'
  }

  if (code === 'auth/network-request-failed') {
    return 'No se pudo conectar con el servicio de autenticación. Intenta nuevamente.'
  }

  if (code === 'auth/invalid-email') {
    return 'Ingresa un correo electrónico válido.'
  }

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password'
  ) {
    return 'Correo o contraseña incorrectos.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  }

  return 'Ocurrió un error al autenticar. Intenta nuevamente.'
}

function mapEmailOperationError(error, operation = 'validate') {
  const code = error?.code

  if (code === 'auth/invalid-email') {
    return 'Ingresa un correo electrónico válido.'
  }

  if (code === 'auth/email-already-in-use') {
    return 'Ese correo ya está registrado. Inicia sesión o usa otro correo.'
  }

  if (code === 'auth/requires-recent-login') {
    return 'Por seguridad, vuelve a iniciar sesión antes de cambiar el correo.'
  }

  if (code === 'auth/invalid-credential' || code === 'auth/user-token-expired') {
    return 'Tu sesión expiró. Cierra sesión, vuelve a entrar e intenta cambiar el correo nuevamente.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos en poco tiempo. Espera unos minutos y vuelve a intentar.'
  }

  if (code === 'auth/operation-not-allowed') {
    if (operation === 'update') {
      return 'No está habilitada la operación para actualizar correo en Firebase Auth. Activa el proveedor Email/Password en Authentication > Sign-in method.'
    }

    return 'No está habilitada la validación de correo en Firebase Auth. Activa el proveedor Email/Password en Authentication > Sign-in method.'
  }

  if (code === 'auth/network-request-failed') {
    return 'No se pudo validar el correo por un problema de conexión. Intenta nuevamente.'
  }

  if (code === 'auth/internal-error') {
    if (operation === 'update') {
      return 'El servicio no pudo actualizar el correo en este momento. Intenta nuevamente en unos minutos.'
    }

    return 'El servicio no pudo validar el correo en este momento. Intenta nuevamente en unos minutos.'
  }

  if (operation === 'update') {
    return `No fue posible actualizar el correo. Intenta nuevamente. (${code || 'sin-codigo'})`
  }

  return `No fue posible validar el correo. Intenta nuevamente. (${code || 'sin-codigo'})`
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
    } catch (error) {
      console.error('No se pudo enviar el correo de verificación:', error)
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
    throw new Error(mapEmailOperationError(error, 'validate'))
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
