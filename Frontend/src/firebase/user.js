import {
  Timestamp,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const USER_COLLECTION = 'usuario'

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.',
    )
  }
}

export async function createUserProfile({
  uid,
  nombre,
  apellido,
  nick,
  email,
  fechaCumpleanos,
  fotoPerfil,
}) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudo crear el perfil: UID inválido.')
  }

  const dateValue = new Date(`${fechaCumpleanos}T00:00:00`)

  if (Number.isNaN(dateValue.getTime())) {
    throw new Error('Ingresa una fecha de cumpleaños válida.')
  }

  await setDoc(doc(db, USER_COLLECTION, uid), {
    UID: uid,
    Nombre: nombre,
    Apellido: apellido,
    Nick: nick,
    Email: email,
    Rol: 'usuario',
    FechaCumpleanos: Timestamp.fromDate(dateValue),
    FotoPerfil: fotoPerfil,
  })
}

export async function getUserProfile(uid) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudo obtener el perfil: UID inválido.')
  }

  const snapshot = await getDoc(doc(db, USER_COLLECTION, uid))

  if (!snapshot.exists()) {
    return null
  }

  const data = snapshot.data()
  const birthdayValue = data.FechaCumpleanos?.toDate
    ? data.FechaCumpleanos.toDate().toISOString().slice(0, 10)
    : ''

  const fotoPerfil =
    data.FotoPerfil && typeof data.FotoPerfil === 'object' && data.FotoPerfil.dataUrl
      ? data.FotoPerfil.dataUrl
      : defaultProfilePicture

  return {
    uid: data.UID || uid,
    nombre: data.Nombre || '',
    apellido: data.Apellido || '',
    nick: data.Nick || '',
    email: data.Email || '',
    rol: data.Rol || '',
    fechaCumpleanos: birthdayValue,
    fotoPerfil,
  }
}

export async function deleteCurrentAccountData({ idToken }) {
  if (!idToken) {
    throw new Error('No se pudo eliminar la cuenta: token inválido.')
  }

  const backendBaseUrl =
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

  let response

  try {
    response = await fetch(`${backendBaseUrl}/api/users/me`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    })
  } catch {
    throw new Error(
      `No se pudo conectar con el backend (${backendBaseUrl}). Verifica que el servidor esté levantado.`,
    )
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      payload?.message || 'No fue posible eliminar la cuenta en el servidor.',
    )
  }

  return payload
}