import {
  collection,
  Timestamp,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  increment,
  query,
  where,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'

const USER_COLLECTION = 'usuario'
const THEMATIC_LISTS_COLLECTION = 'listasTematicas'

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.',
    )
  }
}

function normalizeNick(nick) {
  return String(nick || '').trim().toLowerCase()
}

async function assertUniqueNick({ nick, uidToIgnore = null }) {
  const normalizedNick = normalizeNick(nick)

  if (!normalizedNick) {
    throw new Error('El campo "Nick" es obligatorio.')
  }

  const usersSnapshot = await getDocs(collection(db, USER_COLLECTION))

  const duplicateUser = usersSnapshot.docs.find((userSnapshot) => {
    const data = userSnapshot.data()
    const existingUid = data.UID || userSnapshot.id

    if (uidToIgnore && existingUid === uidToIgnore) {
      return false
    }

    const existingNick = normalizeNick(data.Nick || data.nick || data.NickLower)
    return existingNick === normalizedNick
  })

  if (duplicateUser) {
    throw new Error('Ese nick ya está registrado. Elige otro.')
  }

  return normalizedNick
}

export async function isNickRegistered(nick, uidToIgnore = null) {
  try {
    await assertUniqueNick({ nick, uidToIgnore })
    return false
  } catch (error) {
    if (error instanceof Error && error.message === 'Ese nick ya está registrado. Elige otro.') {
      return true
    }

    throw error
  }
}

export async function updateUserProfile({
  uid,
  nombre,
  apellido,
  nick,
  fechaCumpleanos,
  fotoPerfil,
}) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudo actualizar el perfil: UID inválido.')
  }

  const updatePayload = {}

  if (typeof nombre === 'string') updatePayload.Nombre = nombre
  if (typeof apellido === 'string') updatePayload.Apellido = apellido
  if (typeof nick === 'string') {
    const normalizedNick = await assertUniqueNick({ nick, uidToIgnore: uid })
    updatePayload.Nick = nick
    updatePayload.NickLower = normalizedNick
  }

  if (fechaCumpleanos) {
    const dateValue = new Date(`${fechaCumpleanos}T00:00:00`)

    if (Number.isNaN(dateValue.getTime())) {
      throw new Error('Ingresa una fecha de cumpleaños válida.')
    }

    updatePayload.FechaCumpleanos = Timestamp.fromDate(dateValue)
  }

  // Solo setear FotoPerfil si se proporcionó (puede ser objeto con dataUrl)
  if (typeof fotoPerfil !== 'undefined') {
    updatePayload.FotoPerfil = fotoPerfil
  }

  await setDoc(doc(db, USER_COLLECTION, uid), updatePayload, { merge: true })
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

  const normalizedNick = await assertUniqueNick({ nick, uidToIgnore: uid })
  const dateValue = new Date(`${fechaCumpleanos}T00:00:00`)

  if (Number.isNaN(dateValue.getTime())) {
    throw new Error('Ingresa una fecha de cumpleaños válida.')
  }

  await setDoc(doc(db, USER_COLLECTION, uid), {
    UID: uid,
    Nombre: nombre,
    Apellido: apellido,
    Nick: nick,
    NickLower: normalizedNick,
    Email: email,
    Rol: 'usuario',
    FechaCumpleanos: Timestamp.fromDate(dateValue),
    FotoPerfil: fotoPerfil,
    // Campos denormalizados para conteos en perfil
    totalComics: 0,
    totalTomos: 0,
    cantidadAmigos: 0,
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
    totalComics: typeof data.totalComics === 'number' ? data.totalComics : 0,
    totalTomos: typeof data.totalTomos === 'number' ? data.totalTomos : 0,
    cantidadAmigos: typeof data.cantidadAmigos === 'number' ? data.cantidadAmigos : 0,
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

export async function getAllUsers() {
  ensureFirestoreReady()

  const snapshots = await getDocs(collection(db, USER_COLLECTION))

  return snapshots.docs.map((snap) => {
    const data = snap.data()

    const fotoPerfil =
      data.FotoPerfil && typeof data.FotoPerfil === 'object' && data.FotoPerfil.dataUrl
        ? data.FotoPerfil.dataUrl
        : defaultProfilePicture

    return {
      uid: data.UID || snap.id,
      nick: data.Nick || '',
      nombre: data.Nombre || '',
      apellido: data.Apellido || '',
      fotoPerfil,
    }
  })
}

export async function sendFriendRequest(fromUid, toUid) {
  ensureFirestoreReady()

  if (!fromUid || !toUid) {
    throw new Error('UIDs inválidos para enviar solicitud de amistad.')
  }

  if (fromUid === toUid) {
    throw new Error('No puedes enviarte una solicitud de amistad a ti mismo.')
  }

  const senderProfile = await getUserProfile(fromUid)

  if (!senderProfile) {
    throw new Error('No se encontró el perfil del remitente.')
  }

  const existingRequest = await getDoc(
    doc(db, USER_COLLECTION, toUid, 'SolicitudesAmistad', fromUid)
  )

  if (existingRequest.exists()) {
    throw new Error('Ya existe una solicitud pendiente.')
  }

  await setDoc(doc(db, USER_COLLECTION, toUid, 'SolicitudesAmistad', fromUid), {
    UID: fromUid,
    Nick: senderProfile.nick,
    FotoPerfil: senderProfile.fotoPerfil,
    fechaSolicitud: Timestamp.now(),
  })
}

export async function getFriendRequests(uid) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('UID inválido.')
  }

  const snapshot = await getDocs(
    collection(db, USER_COLLECTION, uid, 'SolicitudesAmistad')
  )

  return snapshot.docs.map((doc) => {
    const data = doc.data()

    return {
      senderUid: data.UID || doc.id,
      nick: data.Nick || '',
      fotoPerfil: data.FotoPerfil || defaultProfilePicture,
      fechaSolicitud: data.fechaSolicitud?.toDate
        ? data.fechaSolicitud.toDate()
        : null,
    }
  })
}

export async function acceptFriendRequest(uid, senderUid) {
  ensureFirestoreReady()

  if (!uid || !senderUid) {
    throw new Error('UIDs inválidos.')
  }

  const senderExists = await getDoc(doc(db, USER_COLLECTION, senderUid))

  if (!senderExists.exists()) {
    throw new Error('No se encontró el perfil del remitente.')
  }

  const recipientExists = await getDoc(doc(db, USER_COLLECTION, uid))

  if (!recipientExists.exists()) {
    throw new Error('No se encontró tu perfil.')
  }

  // Agregar amigo del lado del receptor
  await setDoc(doc(db, USER_COLLECTION, uid, 'Amigos', senderUid), {
    UID: senderUid,
    fechaAmistad: Timestamp.now(),
  })

  // Agregar amigo del lado del remitente
  await setDoc(doc(db, USER_COLLECTION, senderUid, 'Amigos', uid), {
    UID: uid,
    fechaAmistad: Timestamp.now(),
  })

  // Eliminar solicitud pendiente
  try {
    await deleteDoc(doc(db, USER_COLLECTION, uid, 'SolicitudesAmistad', senderUid))
  } catch (err) {
    // Ignorar error si no se puede eliminar
  }

  // Actualizar contador de amigos
  const batch = writeBatch(db)

  batch.update(doc(db, USER_COLLECTION, uid), {
    cantidadAmigos: increment(1),
  })

  batch.update(doc(db, USER_COLLECTION, senderUid), {
    cantidadAmigos: increment(1),
  })

  await batch.commit()
}

export async function declineFriendRequest(uid, senderUid) {
  ensureFirestoreReady()

  if (!uid || !senderUid) {
    throw new Error('UIDs inválidos.')
  }

  // Simplemente eliminar la solicitud
  try {
    await deleteDoc(doc(db, USER_COLLECTION, uid, 'SolicitudesAmistad', senderUid))
  } catch (err) {
    // Ignorar error
  }
}

export async function areFriends(uid1, uid2) {
  ensureFirestoreReady()

  if (!uid1 || !uid2) {
    throw new Error('UIDs inválidos.')
  }

  const friendDoc = await getDoc(doc(db, USER_COLLECTION, uid1, 'Amigos', uid2))

  return friendDoc.exists()
}

export async function getUserFriends(uid) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('UID inválido.')
  }

  const snapshot = await getDocs(collection(db, USER_COLLECTION, uid, 'Amigos'))

  const friends = await Promise.all(
    snapshot.docs.map(async (friendDoc) => {
      const data = friendDoc.data()
      const friendUid = data.UID || friendDoc.id
      const friendProfile = await getUserProfile(friendUid)

      if (!friendProfile) {
        return null
      }

      return {
        uid: friendUid,
        nick: friendProfile.nick || '',
        fotoPerfil: friendProfile.fotoPerfil || defaultProfilePicture,
      }
    })
  )

  return friends.filter(Boolean)
}

export async function removeFriend(uid1, uid2) {
  ensureFirestoreReady()

  if (!uid1 || !uid2) {
    throw new Error('UIDs inválidos.')
  }

  const batch = writeBatch(db)

  batch.delete(doc(db, USER_COLLECTION, uid1, 'Amigos', uid2))
  batch.delete(doc(db, USER_COLLECTION, uid2, 'Amigos', uid1))

  batch.update(doc(db, USER_COLLECTION, uid1), {
    cantidadAmigos: increment(-1),
  })

  batch.update(doc(db, USER_COLLECTION, uid2), {
    cantidadAmigos: increment(-1),
  })

  await batch.commit()
}

export async function blockUser(uid, userToBlockUid) {
  ensureFirestoreReady()

  if (!uid || !userToBlockUid) {
    throw new Error('UIDs inválidos.')
  }

  if (uid === userToBlockUid) {
    throw new Error('No puedes bloquearte a ti mismo.')
  }

  const blockedUserSnapshot = await getDoc(doc(db, USER_COLLECTION, userToBlockUid))

  if (!blockedUserSnapshot.exists()) {
    throw new Error('No se encontró el usuario a bloquear.')
  }

  const batch = writeBatch(db)

  // Agregar a la lista de bloqueados
  batch.set(doc(db, USER_COLLECTION, uid, 'UsuariosBloqueados', userToBlockUid), {
    UID: userToBlockUid,
    fechaBloqueo: Timestamp.now(),
  })

  // Si son amigos, eliminar amistad
  const isFriend = await areFriends(uid, userToBlockUid)

  if (isFriend) {
    batch.delete(doc(db, USER_COLLECTION, uid, 'Amigos', userToBlockUid))
    batch.delete(doc(db, USER_COLLECTION, userToBlockUid, 'Amigos', uid))

    batch.update(doc(db, USER_COLLECTION, uid), {
      cantidadAmigos: increment(-1),
    })

    batch.update(doc(db, USER_COLLECTION, userToBlockUid), {
      cantidadAmigos: increment(-1),
    })
  }

  await batch.commit()

  // Si el usuario bloqueado tenía listas guardadas creadas por quien bloquea,
  // se eliminan de su subcolección de listas guardadas.
  const blockerListsSnapshot = await getDocs(
    query(
      collection(db, THEMATIC_LISTS_COLLECTION),
      where('UserId', '==', uid),
    ),
  )

  if (blockerListsSnapshot.size > 0) {
    const cleanupBatch = writeBatch(db)

    blockerListsSnapshot.docs.forEach((listSnapshot) => {
      const savedRef = doc(
        db,
        USER_COLLECTION,
        userToBlockUid,
        'listasGuardadas',
        listSnapshot.id,
      )

      cleanupBatch.delete(savedRef)
    })

    await cleanupBatch.commit()
  }
}

export async function unblockUser(uid, blockedUid) {
  ensureFirestoreReady()

  if (!uid || !blockedUid) {
    throw new Error('UIDs inválidos.')
  }

  await deleteDoc(doc(db, USER_COLLECTION, uid, 'UsuariosBloqueados', blockedUid))
}

export async function isUserBlocked(uid, byUid) {
  ensureFirestoreReady()

  if (!uid || !byUid) {
    throw new Error('UIDs inválidos.')
  }

  const blockDoc = await getDoc(doc(db, USER_COLLECTION, byUid, 'UsuariosBloqueados', uid))

  return blockDoc.exists()
}

export async function getBlockedUsers(uid) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('UID inválido.')
  }

  const snapshot = await getDocs(collection(db, USER_COLLECTION, uid, 'UsuariosBloqueados'))

  const blockedUsers = await Promise.all(
    snapshot.docs.map(async (blockedDoc) => {
      const data = blockedDoc.data()
      const blockedUid = data.UID || blockedDoc.id
      const blockedProfile = await getUserProfile(blockedUid)

      if (!blockedProfile) {
        return null
      }

      return {
        uid: blockedUid,
        nick: blockedProfile.nick || '',
        fotoPerfil: blockedProfile.fotoPerfil || defaultProfilePicture,
        fechaBloqueo: data.fechaBloqueo?.toDate ? data.fechaBloqueo.toDate() : null,
      }
    })
  )

  return blockedUsers.filter(Boolean)
}

export async function getUsersWhoBlockedUser(uid) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('UID inválido.')
  }

  const usersSnapshot = await getDocs(collection(db, USER_COLLECTION))

  const checks = await Promise.all(
    usersSnapshot.docs.map(async (userSnapshot) => {
      const ownerUid = userSnapshot.id

      if (ownerUid === uid) {
        return null
      }

      const blockDoc = await getDoc(
        doc(db, USER_COLLECTION, ownerUid, 'UsuariosBloqueados', uid),
      )

      return blockDoc.exists() ? ownerUid : null
    }),
  )

  return checks.filter(Boolean)
}