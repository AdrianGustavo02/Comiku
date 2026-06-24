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
  limit,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import {
  createNotification,
  deleteFriendRequestNotification,
  deleteNotificationsByActorUid,
  NOTIFICATION_TYPES,
} from './notifications'
import { deleteUserContentFromActivities } from './activities'
import { containsNumbers } from '../constants/forbiddenInputCharacters'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'

const USER_COLLECTION = 'usuario'
const THEMATIC_LISTS_COLLECTION = 'listasTematicas'

function getUserIdFromData(data, fallbackId = '') {
  return data?.UserID || fallbackId
}

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

function validateNameFieldsWithoutNumbers({ nombre, apellido }) {
  if (typeof nombre === 'string' && containsNumbers(nombre)) {
    throw new Error('El nombre y apellido no pueden contener números.')
  }

  if (typeof apellido === 'string' && containsNumbers(apellido)) {
    throw new Error('El nombre y apellido no pueden contener números.')
  }
}

async function assertUniqueNick({ nick, uidToIgnore = null }) {
  const normalizedNick = normalizeNick(nick)

  if (!normalizedNick) {
    throw new Error('El campo "Nick" es obligatorio.')
  }

  //Consultar por nick exacto para evitar leer toda la colección.
  //Permite variaciones: batman, BATMAN y BaTmAn son usuarios diferentes.
    const q = query(
    collection(db, USER_COLLECTION),
    where('Nick', '==', nick),
    limit(1),
  )

  const snapshot = await getDocs(q)

  if (snapshot.docs.length === 0) {
    //No existe duplicado.
    return normalizedNick
  }

  const found = snapshot.docs[0]
  const existingUid = getUserIdFromData(found.data(), found.id)

  if (uidToIgnore && existingUid === uidToIgnore) {
    return normalizedNick
  }

  throw new Error('Ese nick ya está registrado. Elige otro.')
}

//Verifico si un nick ya esta registrado en la base de datos.
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

//Actualizo el perfil de un usuario.
export async function updateUserProfile({
  uid,
  nombre,
  apellido,
  nick,
  fechaNacimiento,
  fotoPerfil,
}) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudo actualizar el perfil: UID inválido.')
  }

  validateNameFieldsWithoutNumbers({ nombre, apellido })

  const updatePayload = {}

  if (typeof nombre === 'string') updatePayload.Nombre = nombre
  if (typeof apellido === 'string') updatePayload.Apellido = apellido
  if (typeof nick === 'string') {
    await assertUniqueNick({ nick, uidToIgnore: uid })
    updatePayload.Nick = nick
  }

  if (fechaNacimiento) {
    const dateValue = new Date(`${fechaNacimiento}T00:00:00`)

    if (Number.isNaN(dateValue.getTime())) {
      throw new Error('Ingresa una fecha de cumpleaños válida.')
    }

    updatePayload.FechaNacimiento = Timestamp.fromDate(dateValue)
  }


  if (typeof fotoPerfil !== 'undefined') {
    updatePayload.FotoPerfil = fotoPerfil
  }

  await setDoc(doc(db, USER_COLLECTION, uid), updatePayload, { merge: true })
}

//Creo el perfil de un usuario.
export async function createUserProfile({
  uid,
  nombre,
  apellido,
  nick,
  email,
  fechaNacimiento,
  fotoPerfil,
}) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudo crear el perfil: UID inválido.')
  }

  validateNameFieldsWithoutNumbers({ nombre, apellido })

  await assertUniqueNick({ nick, uidToIgnore: uid })
  const dateValue = new Date(`${fechaNacimiento}T00:00:00`)

  if (Number.isNaN(dateValue.getTime())) {
    throw new Error('Ingresa una fecha de cumpleaños válida.')
  }

  await setDoc(doc(db, USER_COLLECTION, uid), {
    UserID: uid,
    Nombre: nombre,
    Apellido: apellido,
    Nick: nick,
    Email: email,
    Rol: 'usuario',
    FechaNacimiento: Timestamp.fromDate(dateValue),
    FotoPerfil: fotoPerfil,
    totalComics: 0,
    totalTomos: 0,
    cantidadAmigos: 0,
    featuredComicIds: [],
  })
}

//Obtengo el perfil de un usuario.
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
  const birthdateSource = data.FechaNacimiento || null
  const birthdayValue = birthdateSource?.toDate
    ? birthdateSource.toDate().toISOString().slice(0, 10)
    : ''

  const fotoPerfil =
    data.FotoPerfil && typeof data.FotoPerfil === 'object' && data.FotoPerfil.dataUrl
      ? data.FotoPerfil.dataUrl
      : defaultProfilePicture

  return {
    uid: getUserIdFromData(data, uid),
    nombre: data.Nombre || '',
    apellido: data.Apellido || '',
    nick: data.Nick || '',
    email: data.Email || '',
    rol: data.Rol || '',
    fechaNacimiento: birthdayValue,
    fotoPerfil,
    totalComics: typeof data.totalComics === 'number' ? data.totalComics : 0,
    totalTomos: typeof data.totalTomos === 'number' ? data.totalTomos : 0,
    cantidadAmigos: typeof data.cantidadAmigos === 'number' ? data.cantidadAmigos : 0,
    featuredComicIds: Array.isArray(data.featuredComicIds)
      ? data.featuredComicIds.map((value) => String(value)).filter(Boolean).slice(0, 10)
      : [],
  }
}

//Actualizo los comics destacados de un usuario.
export async function updateUserFeaturedComicIds({ uid, comicIds }) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudieron guardar los destacados: UID inválido.')
  }

  const nextComicIds = Array.from(
    new Set(
      Array.isArray(comicIds)
        ? comicIds.map((value) => String(value).trim()).filter(Boolean)
        : [],
    ),
  ).slice(0, 10)

  await setDoc(
    doc(db, USER_COLLECTION, uid),
    {
      featuredComicIds: nextComicIds,
    },
    { merge: true },
  )

  return nextComicIds
}

//Elimino la cuenta del usuario.
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

//Elimino la cuenta de un usuario desde el panel de administracion.
export async function deleteUserAccountByAdmin({ idToken, uid }) {
  if (!idToken || !uid) {
    throw new Error('No se pudo eliminar la cuenta: datos inválidos.')
  }

  const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

  let response

  try {
    response = await fetch(`${backendBaseUrl}/api/admin/users/${encodeURIComponent(uid)}`, {
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
      uid: getUserIdFromData(data, snap.id),
      nick: data.Nick || '',
      nombre: data.Nombre || '',
      apellido: data.Apellido || '',
      fotoPerfil,
    }
  })
}

//Envío una solicitud de amistad a otro usuario.
export async function sendFriendRequest(fromUid, toUid) {
  ensureFirestoreReady()

  if (!fromUid || !toUid) {
    throw new Error('UIDs inválidos para enviar solicitud de amistad.')
  }

  if (fromUid === toUid) {
    throw new Error('No puedes enviarte una solicitud de amistad a ti mismo.')
  }

  //Verifico si el receptor tiene bloqueado al remitente.
  const isBlockedByRecipient = await isUserBlocked(fromUid, toUid)
  if (isBlockedByRecipient) {
    throw new Error('No puedes enviar solicitud de amistad a este usuario.')
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
    UserID: fromUid,
    Nick: senderProfile.nick,
    FotoPerfil: senderProfile.fotoPerfil,
    fechaSolicitud: Timestamp.now(),
  })

  try {
    await createNotification({
      userId: toUid,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST,
      actorUid: fromUid,
      metadata: {},
    })
  } catch (error) {
    console.error('Error al crear la notificación de solicitud de amistad:', error)
  }
}

//Obtengo las solicitudes de amistad pendientes para un usuario.
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
      senderUid: getUserIdFromData(data, doc.id),
      nick: data.Nick || '',
      fotoPerfil: data.FotoPerfil || defaultProfilePicture,
      fechaSolicitud: data.fechaSolicitud?.toDate
        ? data.fechaSolicitud.toDate()
        : null,
    }
  })
}

//Acepto una solicitud de amistad.
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

  //Verifico si el receptor ha bloqueado al remitente..
  const isBlockedByRecipient = await isUserBlocked(senderUid, uid)
  if (isBlockedByRecipient) {
    throw new Error('No puedes aceptar la solicitud de amistad de este usuario.')
  }

  //Verifico si el remitente ha bloqueado al receptor.
  const isBlockedBySender = await isUserBlocked(uid, senderUid)
  if (isBlockedBySender) {
    throw new Error('No puedes aceptar la solicitud de amistad de este usuario.')
  }

  //Agrego amigo del lado del receptor.
  await setDoc(doc(db, USER_COLLECTION, uid, 'Amigos', senderUid), {
    UserID: senderUid,
    fechaAmistad: Timestamp.now(),
  })

  //Agrego amigo del lado del remitente.
  await setDoc(doc(db, USER_COLLECTION, senderUid, 'Amigos', uid), {
    UserID: uid,
    fechaAmistad: Timestamp.now(),
  })

  //Elimino la solicitud pendiente.
  try {
    await deleteDoc(doc(db, USER_COLLECTION, uid, 'SolicitudesAmistad', senderUid))
  } catch (error) {
    void error
  }

  //Actualizo el contador de amigos.
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
    try {
      await deleteFriendRequestNotification({ userId: uid, actorUid: senderUid })
    } catch (err) {
      void err
    }
  } catch (error) {
    void error
  }
}

export async function cancelSentFriendRequest(fromUid, toUid) {
  ensureFirestoreReady()

  if (!fromUid || !toUid) {
    throw new Error('UIDs inválidos para cancelar solicitud de amistad.')
  }

  if (fromUid === toUid) {
    throw new Error('No puedes cancelar una solicitud hacia ti mismo.')
  }

  await deleteDoc(doc(db, USER_COLLECTION, toUid, 'SolicitudesAmistad', fromUid))

  try {
    await deleteFriendRequestNotification({ userId: toUid, actorUid: fromUid })
  } catch (error) {
    console.error('Error al eliminar la notificación de solicitud de amistad al cancelar:', error)
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
      const friendUid = getUserIdFromData(data, friendDoc.id)
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

  try {
    await deleteNotificationsByActorUid(uid1, uid2)
    await deleteNotificationsByActorUid(uid2, uid1)
  } catch (error) {
    console.error('Error al eliminar notificaciones en removeFriend:', error)
  }

  try {
    await deleteUserContentFromActivities(uid1, uid2)
    await deleteUserContentFromActivities(uid2, uid1)
  } catch (error) {
    console.error('Error al eliminar contenido de usuario en removeFriend:', error)
  }
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

  //Agrego a la lista de bloqueados.
  batch.set(doc(db, USER_COLLECTION, uid, 'UsuariosBloqueados', userToBlockUid), {
    UserID: userToBlockUid,
    fechaBloqueo: Timestamp.now(),
  })

  //Si son amigos, elimino la amistad.
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

  try {
    await deleteNotificationsByActorUid(uid, userToBlockUid)
    await deleteNotificationsByActorUid(userToBlockUid, uid)
  } catch (error) {
    console.error('Error al eliminar notificaciones en blockUser:', error)
  }

  try {
    //Elimino solicitudes de amistad pendientes en ambas direcciones.
    await deleteDoc(doc(db, USER_COLLECTION, uid, 'SolicitudesAmistad', userToBlockUid))
    await deleteDoc(doc(db, USER_COLLECTION, userToBlockUid, 'SolicitudesAmistad', uid))
  } catch (error) {
    console.error('Error al eliminar solicitudes de amistad en blockUser:', error)
  }

  try {
    await deleteUserContentFromActivities(uid, userToBlockUid)
    await deleteUserContentFromActivities(userToBlockUid, uid)
  } catch (error) {
    console.error('Error al eliminar contenido de usuario en blockUser:', error)
  }

  //Si el usuario bloqueado tenía listas guardadas creadas por quien bloquea,
  //se eliminan de su subcolección de listas guardadas.
  const blockerListsSnapshot = await getDocs(
    query(
      collection(db, THEMATIC_LISTS_COLLECTION),
      where('UserID', '==', uid),
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

//Desbloqueo a un usuario.
export async function unblockUser(uid, blockedUid) {
  ensureFirestoreReady()

  if (!uid || !blockedUid) {
    throw new Error('UIDs inválidos.')
  }

  await deleteDoc(doc(db, USER_COLLECTION, uid, 'UsuariosBloqueados', blockedUid))
}

//Verifico si un usuario bloqueó a otro.
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
      const blockedUid = getUserIdFromData(data, blockedDoc.id)
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

export async function setUserRole(uid, role) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('UID inválido.')
  }

  if (!role || (role !== 'usuario' && role !== 'admin')) {
    throw new Error('Rol inválido.')
  }

  await setDoc(doc(db, USER_COLLECTION, uid), { Rol: role }, { merge: true })
}

export async function getUsersNicksByUids(uids) {
  ensureFirestoreReady()

  if (!Array.isArray(uids) || uids.length === 0) {
    return {}
  }

  const nickMap = {}

  try {
    //Cargo todos los usuarios de una vez.
    const userDocs = await Promise.all(
      uids.map((uid) => getDoc(doc(db, USER_COLLECTION, uid)))
    )

    userDocs.forEach((docSnapshot, index) => {
      const uid = uids[index]
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data()
        nickMap[uid] = userData.Nick || userData.nick || uid
      } else {
        nickMap[uid] = uid
      }
    })
  } catch (error) {
    console.error('Error al cargar los nicks de usuarios:', error)
    //Devuelvo los UIDs como nicks.
    uids.forEach((uid) => {
      nickMap[uid] = uid
    })
  }

  return nickMap
}

export async function canSendMessageTo(senderId, channel) {
  ensureFirestoreReady()

  // Solo aplico restricciones a los chats 1:1.
  if (!channel?.data?.members || channel.data.members.length !== 2) {
    return true
  }

  // Obtengo el ID del otro usuario.
  const members = channel.data.members
  const recipientId = members.find((uid) => uid !== senderId)

  if (!recipientId) {
    return true
  }

  try {
    //Verifico si el remitente bloqueo al destinatario.
    const senderBlockedRecipient = await isUserBlocked(recipientId, senderId)
    if (senderBlockedRecipient) {
      return false
    }

    //Verifico si el destinatario bloqueo al remitente.
    const recipientBlockedSender = await isUserBlocked(senderId, recipientId)
    if (recipientBlockedSender) {
      return false
    }

    //Verifico si son amigos, si no lo son, no pueden enviarse mensajes.
    const areFriendsValue = await areFriends(senderId, recipientId)
    if (!areFriendsValue) {
      return false
    }

    return true
  } catch (error) {
    console.error('Error al verificar el permiso para enviar mensajes:', error)
    return true
  }
}