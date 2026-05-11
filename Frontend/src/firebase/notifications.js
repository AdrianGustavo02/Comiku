import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { getUserProfile } from './user'

const NOTIFICATIONS_COLLECTION = 'notificaciones'

// Tipos de notificaciones escalables
export const NOTIFICATION_TYPES = {
  ACTIVITY_LIKE: 'activity_like',
  ACTIVITY_COMMENT: 'activity_comment',
  FRIEND_REQUEST: 'friend_request',
  THEMATIC_LIST_LIKE: 'thematic_list_like',
  THEMATIC_LIST_COMMENT: 'thematic_list_comment',
}

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.')
  }
}

function mapNotificationSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    userId: data.userId || '',
    type: data.type || '',
    actorUid: data.actorUid || '',
    leido: data.leido || false,
    fecha: data.fecha || null,
    metadata: data.metadata || {},
  }
}

function toMillis(value) {
  if (!value) {
    return 0
  }

  if (typeof value?.toMillis === 'function') {
    return value.toMillis()
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number') {
    return value
  }

  return 0
}

/**
 * Crea una notificación
 * @param {string} userId - UID del usuario que recibe la notificación
 * @param {string} type - Tipo de notificación (NOTIFICATION_TYPES)
 * @param {string} actorUid - UID del usuario que realiza la acción
 * @param {object} metadata - Datos específicos de la notificación (activityId, listId, etc.)
 */
export async function createNotification({ userId, type, actorUid, metadata = {} }) {
  ensureFirestoreReady()

  if (!userId || !type || !actorUid) {
    throw new Error('userId, type y actorUid son obligatorios.')
  }

  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    throw new Error('Tipo de notificación inválido.')
  }

  if (userId === actorUid) {
    return
  }

  try {
    await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
      userId,
      type,
      actorUid,
      metadata,
      leido: false,
      fecha: Timestamp.now(),
    })
  } catch (error) {
    console.error('Error al crear notificación:', error)
  }
}

/**
 * Obtiene una página de notificaciones del usuario
 */
export async function getNotificationsPage({ userId, pageSize = 15, cursor = null }) {
  ensureFirestoreReady()

  if (!userId) {
    throw new Error('userId es obligatorio.')
  }

  let notifications = []

  try {
    let notificationQuery = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('fecha', 'desc'),
      limit(pageSize),
    )

    if (cursor?.fecha) {
      notificationQuery = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('fecha', 'desc'),
        startAfter(cursor.fecha),
        limit(pageSize),
      )
    }

    const snapshots = await getDocs(notificationQuery)
    notifications = snapshots.docs.map(mapNotificationSnapshot)
  } catch (error) {
    // Fallback sin orderBy para entornos sin indice compuesto userId+fecha.
    const fallbackQuery = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
    )

    const fallbackSnapshots = await getDocs(fallbackQuery)
    const allNotifications = fallbackSnapshots.docs
      .map(mapNotificationSnapshot)
      .sort((left, right) => {
        const byDate = toMillis(right.fecha) - toMillis(left.fecha)

        if (byDate !== 0) {
          return byDate
        }

        return right.id.localeCompare(left.id)
      })

    const filteredNotifications = cursor
      ? allNotifications.filter((item) => {
          const itemMs = toMillis(item.fecha)
          const cursorMs = toMillis(cursor.fecha)

          if (itemMs < cursorMs) {
            return true
          }

          if (itemMs > cursorMs) {
            return false
          }

          return item.id.localeCompare(cursor.id || '') < 0
        })
      : allNotifications

    notifications = filteredNotifications.slice(0, pageSize)
    void error
  }

  const lastNotification = notifications.length > 0
    ? notifications[notifications.length - 1]
    : null

  // Hidratar perfiles de actores
  const uniqueActorUids = Array.from(
    new Set(notifications.map((n) => n.actorUid).filter(Boolean)),
  )

  const profilesByUid = new Map()

  await Promise.all(
    uniqueActorUids.map(async (uid) => {
      try {
        const profile = await getUserProfile(uid)
        profilesByUid.set(uid, profile)
      } catch {
        profilesByUid.set(uid, null)
      }
    }),
  )

  const hydratedNotifications = notifications.map((notification) => {
    const profile = profilesByUid.get(notification.actorUid)

    return {
      ...notification,
      actorNick: profile?.nick || '',
      actorFotoPerfil: profile?.fotoPerfil || null,
    }
  })

  return {
    notifications: hydratedNotifications,
    lastCursor: lastNotification
      ? {
          id: lastNotification.id,
          fecha: lastNotification.fecha,
        }
      : null,
  }
}

/**
 * Marca una notificación como leída
 */
export async function markNotificationAsRead(notificationId) {
  ensureFirestoreReady()

  if (!notificationId) {
    throw new Error('notificationId es obligatorio.')
  }

  try {
    await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
      leido: true,
    })
  } catch (error) {
    console.error('Error al marcar notificación como leída:', error)
  }
}

/**
 * Marca todas las notificaciones no leídas del usuario como leídas
 */
export async function markAllNotificationsAsRead(userId) {
  ensureFirestoreReady()

  if (!userId) {
    throw new Error('userId es obligatorio.')
  }

  const unreadQuery = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('leido', '==', false),
  )

  const snapshots = await getDocs(unreadQuery)

  if (snapshots.empty) {
    return
  }

  const batch = writeBatch(db)

  snapshots.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, { leido: true })
  })

  await batch.commit()
}

/**
 * Cuenta notificaciones no leídas
 */
export async function getUnreadNotificationsCount(userId) {
  ensureFirestoreReady()

  if (!userId) {
    throw new Error('userId es obligatorio.')
  }

  const unreadQuery = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('leido', '==', false),
  )

  const snapshots = await getDocs(unreadQuery)

  return snapshots.size
}

/**
 * Elimina notificaciones relacionadas a un usuario específico
 * Usado cuando: se elimina amistad, se bloquea usuario, se elimina cuenta
 */
export async function deleteNotificationsByActorUid(userId, actorUid) {
  ensureFirestoreReady()

  if (!userId || !actorUid) {
    throw new Error('userId y actorUid son obligatorios.')
  }

  const notificationsQuery = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('actorUid', '==', actorUid),
  )

  const snapshots = await getDocs(notificationsQuery)

  const batch = writeBatch(db)

  snapshots.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref)
  })

  if (snapshots.size > 0) {
    await batch.commit()
  }
}

/**
 * Elimina notificaciones relacionadas a un tipo específico y objeto
 * Usado cuando se elimina una actividad, lista temática, etc.
 */
export async function deleteNotificationsByMetadata({
  userId,
  type,
  metadataKey,
  metadataValue,
  actorUid = null,
}) {
  ensureFirestoreReady()

  if (!userId || !type || !metadataKey || !metadataValue) {
    throw new Error('userId, type, metadataKey y metadataValue son obligatorios.')
  }

  const notificationsQuery = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('type', '==', type),
  )

  const snapshots = await getDocs(notificationsQuery)

  const toDelete = snapshots.docs.filter((docSnap) => {
    const data = docSnap.data()
    if (data.metadata?.[metadataKey] !== metadataValue) return false

    if (actorUid && data.actorUid !== actorUid) return false

    return true
  })

  if (toDelete.length === 0) {
    return
  }

  const batch = writeBatch(db)

  toDelete.forEach((docSnap) => {
    batch.delete(docSnap.ref)
  })

  await batch.commit()
}

/**
 * Elimina todas las notificaciones de un usuario cuando elimina su cuenta
 */
export async function deleteAllNotificationsForUser(userId) {
  ensureFirestoreReady()

  if (!userId) {
    throw new Error('userId es obligatorio.')
  }

  const notificationsQuery = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
  )

  const snapshots = await getDocs(notificationsQuery)

  if (snapshots.empty) {
    return
  }

  const batch = writeBatch(db)

  snapshots.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref)
  })

  await batch.commit()
}

/**
 * Elimina todas las notificaciones donde el usuario es el actor
 * Usado cuando se elimina la cuenta del usuario
 */
export async function deleteAllNotificationsFromActor(actorUid) {
  ensureFirestoreReady()

  if (!actorUid) {
    throw new Error('actorUid es obligatorio.')
  }

  const notificationsQuery = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('actorUid', '==', actorUid),
  )

  const snapshots = await getDocs(notificationsQuery)

  if (snapshots.empty) {
    return
  }

  const batch = writeBatch(db)

  snapshots.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref)
  })

  await batch.commit()
}
