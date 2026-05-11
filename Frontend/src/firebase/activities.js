import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { getUserProfile } from './user'
import { createNotification, NOTIFICATION_TYPES, deleteNotificationsByMetadata } from './notifications'

const ACTIVITIES_COLLECTION = 'actividades'
const COMMENTS_SUBCOLLECTION = 'comentarios'
const LIKES_SUBCOLLECTION = 'likes'
const FIRESTORE_IN_LIMIT = 10

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.')
  }
}

function toMillis(dateValue) {
  if (!dateValue) {
    return 0
  }

  if (typeof dateValue?.toMillis === 'function') {
    return dateValue.toMillis()
  }

  if (typeof dateValue?.toDate === 'function') {
    return dateValue.toDate().getTime()
  }

  if (dateValue instanceof Date) {
    return dateValue.getTime()
  }

  if (typeof dateValue === 'number') {
    return dateValue
  }

  return 0
}

function getDayKey(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function splitInChunks(values, chunkSize) {
  const chunks = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}

function mapActivitySnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    actorUid: data.actorUid || '',
    actorNick: data.actorNick || '',
    actorFotoPerfil: data.actorFotoPerfil || null,
    type: data.type || '',
    payload: data.payload || {},
    fecha: data.fecha || null,
    dayKey: data.dayKey || '',
    likesCount: Number.isFinite(data.likesCount) ? data.likesCount : 0,
    commentsCount: Number.isFinite(data.commentsCount) ? data.commentsCount : 0,
  }
}

function mapCommentSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    uid: data.uid || '',
    nick: data.nick || '',
    fotoPerfil: data.fotoPerfil || null,
    texto: data.texto || '',
    fecha: data.fecha || null,
  }
}

async function hydrateProfilesByUid(items, uidField) {
  const uniqueUids = Array.from(
    new Set(
      (items || [])
        .map((item) => item?.[uidField])
        .filter((uid) => typeof uid === 'string' && uid.trim()),
    ),
  )

  if (uniqueUids.length === 0) {
    return new Map()
  }

  const profiles = await Promise.all(
    uniqueUids.map(async (uid) => {
      try {
        const profile = await getUserProfile(uid)
        return [uid, profile]
      } catch (error) {
        void error
        return [uid, null]
      }
    }),
  )

  return new Map(profiles)
}

function buildCommentsCursor(snapshot) {
  if (!snapshot) {
    return null
  }

  const data = snapshot.data()

  return {
    id: snapshot.id,
    fecha: data.fecha || null,
  }
}

export async function getActivitiesPage({ friendUids, pageSize = 10, cursor = null, includeOwnUid = null }) {
  ensureFirestoreReady()

  const cleanFriendUids = Array.from(
    new Set((friendUids || []).filter((friendUid) => typeof friendUid === 'string' && friendUid.trim())),
  )

  const uidsToFetch = includeOwnUid ? [includeOwnUid, ...cleanFriendUids] : cleanFriendUids

  if (uidsToFetch.length === 0) {
    return {
      items: [],
      last: null,
    }
  }

  const chunks = splitInChunks(uidsToFetch, FIRESTORE_IN_LIMIT)
  const fetchSize = Math.max(pageSize * 3, 30)

  const pages = await Promise.all(
    chunks.map(async (uidsChunk) => {
      const activitiesQuery = query(
        collection(db, ACTIVITIES_COLLECTION),
        where('actorUid', 'in', uidsChunk),
        limit(fetchSize),
      )

      const snapshots = await getDocs(activitiesQuery)
      return snapshots.docs.map(mapActivitySnapshot)
    }),
  )

  const allItems = pages
    .flat()
    .sort((left, right) => {
      const byDate = toMillis(right.fecha) - toMillis(left.fecha)

      if (byDate !== 0) {
        return byDate
      }

      return right.id.localeCompare(left.id)
    })

  const filteredItems = cursor
    ? allItems.filter((item) => {
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
    : allItems

  const items = filteredItems.slice(0, pageSize)
  const profilesByUid = await hydrateProfilesByUid(items, 'actorUid')
  const hydratedItems = items.map((item) => {
    const profile = profilesByUid.get(item.actorUid)

    return {
      ...item,
      actorNick: profile?.nick || item.actorNick || '',
      actorFotoPerfil: profile?.fotoPerfil || item.actorFotoPerfil || null,
    }
  })
  const lastItem = items.length > 0 ? items[items.length - 1] : null

  return {
    items: hydratedItems,
    last: lastItem
      ? {
          id: lastItem.id,
          fecha: lastItem.fecha,
        }
      : null,
  }
}

export async function getActivityById(activityId) {
  ensureFirestoreReady()

  if (!activityId) {
    return null
  }

  const activityRef = doc(db, ACTIVITIES_COLLECTION, activityId)
  const activitySnapshot = await getDoc(activityRef)

  if (!activitySnapshot.exists()) {
    return null
  }

  const item = mapActivitySnapshot(activitySnapshot)
  const profilesByUid = await hydrateProfilesByUid([item], 'actorUid')
  const profile = profilesByUid.get(item.actorUid)

  return {
    ...item,
    actorNick: profile?.nick || item.actorNick || '',
    actorFotoPerfil: profile?.fotoPerfil || item.actorFotoPerfil || null,
  }
}

export async function toggleLikeActivity({ activityId, uid }) {
  ensureFirestoreReady()

  if (!activityId || !uid) {
    throw new Error('Actividad y usuario son obligatorios.')
  }

  const activityReference = doc(db, ACTIVITIES_COLLECTION, activityId)
  const likeReference = doc(activityReference, LIKES_SUBCOLLECTION, uid)
  const likeSnapshot = await getDoc(likeReference)

  if (likeSnapshot.exists()) {
    await deleteDoc(likeReference)

    try {
      await updateDoc(activityReference, {
        likesCount: increment(-1),
      })
    } catch (error) {
      void error
    }

    try {
      // Eliminar notificación asociada al like (si existe)
      const activitySnapshot = await getDoc(activityReference)
      if (activitySnapshot.exists()) {
        const activityData = activitySnapshot.data()
        const actorUid = activityData.actorUid

        if (actorUid && actorUid !== uid) {
          try {
            await deleteNotificationsByMetadata({
              userId: actorUid,
              type: NOTIFICATION_TYPES.ACTIVITY_LIKE,
              metadataKey: 'activityId',
              metadataValue: activityId,
              actorUid: uid,
            })
          } catch (err) {
            void err
          }
        }
      }
    } catch (err) {
      void err
    }

    return { liked: false }
  }

  await setDoc(likeReference, {
    uid,
    fecha: Timestamp.now(),
  })

  try {
    await updateDoc(activityReference, {
      likesCount: increment(1),
    })

    // Crear notificación al propietario de la actividad
    const activitySnapshot = await getDoc(activityReference)
    if (activitySnapshot.exists()) {
      const activityData = activitySnapshot.data()
      const actorUid = activityData.actorUid

      if (actorUid && actorUid !== uid) {
        await createNotification({
          userId: actorUid,
          type: NOTIFICATION_TYPES.ACTIVITY_LIKE,
          actorUid: uid,
          metadata: {
            activityId,
          },
        })
      }
    }
  } catch (error) {
    void error
  }

  return { liked: true }
}

export async function getLikesCount(activityId) {
  ensureFirestoreReady()

  if (!activityId) {
    return 0
  }

  const likesCollectionReference = collection(
    db,
    ACTIVITIES_COLLECTION,
    activityId,
    LIKES_SUBCOLLECTION,
  )

  const likesCountSnapshot = await getCountFromServer(likesCollectionReference)

  return likesCountSnapshot.data().count || 0
}

export async function getUserLikeStatus(activityId, uid) {
  ensureFirestoreReady()

  if (!activityId || !uid) {
    return false
  }

  const likeSnapshot = await getDoc(
    doc(db, ACTIVITIES_COLLECTION, activityId, LIKES_SUBCOLLECTION, uid),
  )

  return likeSnapshot.exists()
}

export async function addComment({ activityId, uid, texto }) {
  ensureFirestoreReady()

  const cleanText = (texto || '').trim()

  if (!activityId || !uid || !cleanText) {
    throw new Error('Actividad, usuario y texto son obligatorios.')
  }

  const activityReference = doc(db, ACTIVITIES_COLLECTION, activityId)

  await addDoc(collection(activityReference, COMMENTS_SUBCOLLECTION), {
    uid,
    texto: cleanText,
    fecha: Timestamp.now(),
  })

  try {
    await updateDoc(activityReference, {
      commentsCount: increment(1),
    })

    // Crear notificación al propietario de la actividad
    const activitySnapshot = await getDoc(activityReference)
    if (activitySnapshot.exists()) {
      const activityData = activitySnapshot.data()
      const actorUid = activityData.actorUid

      if (actorUid && actorUid !== uid) {
        await createNotification({
          userId: actorUid,
          type: NOTIFICATION_TYPES.ACTIVITY_COMMENT,
          actorUid: uid,
          metadata: {
            activityId,
          },
        })
      }
    }
  } catch (error) {
    void error
  }
}

export async function deleteComment({ activityId, commentId, uid }) {
  ensureFirestoreReady()

  if (!activityId || !commentId || !uid) {
    throw new Error('Actividad, comentario y usuario son obligatorios.')
  }

  const activityReference = doc(db, ACTIVITIES_COLLECTION, activityId)
  const commentReference = doc(activityReference, COMMENTS_SUBCOLLECTION, commentId)
  const commentSnapshot = await getDoc(commentReference)

  if (!commentSnapshot.exists()) {
    throw new Error('No se encontró el comentario.')
  }

  const commentData = commentSnapshot.data()

  if (commentData.uid !== uid) {
    throw new Error('Solo puedes eliminar tus propios comentarios.')
  }

  await deleteDoc(commentReference)

  try {
    await updateDoc(activityReference, {
      commentsCount: increment(-1),
    })
  } catch (error) {
    void error
  }
  try {
    // Eliminar notificación asociada al comentario (si existe)
    const activitySnapshot = await getDoc(activityReference)
    if (activitySnapshot.exists()) {
      const activityData = activitySnapshot.data()
      const actorUid = activityData.actorUid

      if (actorUid && actorUid !== uid) {
        try {
          await deleteNotificationsByMetadata({
            userId: actorUid,
            type: NOTIFICATION_TYPES.ACTIVITY_COMMENT,
            metadataKey: 'activityId',
            metadataValue: activityId,
            actorUid: uid,
          })
        } catch (err) {
          void err
        }
      }
    }
  } catch (err) {
    void err
  }
}

export async function getCommentsPage({ activityId, pageSize = 10, cursor = null }) {
  ensureFirestoreReady()

  if (!activityId) {
    throw new Error('ID de actividad es obligatorio.')
  }

  const commentsReference = collection(
    db,
    ACTIVITIES_COLLECTION,
    activityId,
    COMMENTS_SUBCOLLECTION,
  )

  let commentsQuery = query(
    commentsReference,
    orderBy('fecha', 'desc'),
    orderBy('__name__', 'desc'),
    limit(pageSize),
  )

  if (cursor?.fecha && cursor?.id) {
    commentsQuery = query(
      commentsReference,
      orderBy('fecha', 'desc'),
      orderBy('__name__', 'desc'),
      startAfter(cursor.fecha, cursor.id),
      limit(pageSize),
    )
  }

  const snapshots = await getDocs(commentsQuery)
  const lastSnapshot = snapshots.docs.length > 0 ? snapshots.docs[snapshots.docs.length - 1] : null
  const items = snapshots.docs.map(mapCommentSnapshot)
  const profilesByUid = await hydrateProfilesByUid(items, 'uid')
  const hydratedItems = items.map((item) => {
    const profile = profilesByUid.get(item.uid)

    return {
      ...item,
      nick: profile?.nick || item.nick || '',
      fotoPerfil: profile?.fotoPerfil || item.fotoPerfil || null,
    }
  })

  return {
    items: hydratedItems,
    last: buildCommentsCursor(lastSnapshot),
  }
}

async function findTodayActivity({ actorUid, type, dayKey }) {
  const todayQuery = query(
    collection(db, ACTIVITIES_COLLECTION),
    where('actorUid', '==', actorUid),
    where('type', '==', type),
    where('dayKey', '==', dayKey),
    limit(1),
  )

  const snapshots = await getDocs(todayQuery)

  if (snapshots.empty) {
    return null
  }

  return snapshots.docs[0]
}

export async function appendVolumeActivityForToday({
  actorUid,
  actorNick,
  actorFotoPerfil,
  type,
  volume,
}) {
  ensureFirestoreReady()

  if (!actorUid || !type || !volume?.comicId || !volume?.volumeId) {
    throw new Error('Datos de actividad inválidos para agregar tomo.')
  }

  const dayKey = getDayKey()
  const existingSnapshot = await findTodayActivity({ actorUid, type, dayKey })

  if (!existingSnapshot) {
    await addDoc(collection(db, ACTIVITIES_COLLECTION), {
      actorUid,
      type,
      payload: {
        count: 1,
        volumes: [volume],
      },
      dayKey,
      likesCount: 0,
      commentsCount: 0,
      fecha: Timestamp.now(),
    })

    return
  }

  const existingData = existingSnapshot.data()
  const currentVolumes = Array.isArray(existingData?.payload?.volumes)
    ? existingData.payload.volumes
    : []

  const alreadyIncluded = currentVolumes.some(
    (item) => item?.comicId === volume.comicId && item?.volumeId === volume.volumeId,
  )

  const nextVolumes = alreadyIncluded ? currentVolumes : [volume, ...currentVolumes].slice(0, 20)
  const nextCount = alreadyIncluded
    ? Number.isFinite(existingData?.payload?.count)
      ? existingData.payload.count
      : nextVolumes.length
    : (Number.isFinite(existingData?.payload?.count) ? existingData.payload.count : currentVolumes.length) + 1

  await updateDoc(existingSnapshot.ref, {
    payload: {
      count: nextCount,
      volumes: nextVolumes,
    },
    fecha: Timestamp.now(),
  })
}

export async function appendThematicListActivityForToday({
  actorUid,
  actorNick,
  actorFotoPerfil,
  list,
}) {
  ensureFirestoreReady()

  if (!actorUid || !list?.id || !list?.name) {
    throw new Error('Datos de actividad inválidos para lista temática.')
  }

  const type = 'thematic_list_create'
  const dayKey = getDayKey()
  const existingSnapshot = await findTodayActivity({ actorUid, type, dayKey })

  if (!existingSnapshot) {
    await addDoc(collection(db, ACTIVITIES_COLLECTION), {
      actorUid,
      type,
      payload: {
        count: 1,
        lists: [list],
      },
      dayKey,
      likesCount: 0,
      commentsCount: 0,
      fecha: Timestamp.now(),
    })

    return
  }

  const existingData = existingSnapshot.data()
  const currentLists = Array.isArray(existingData?.payload?.lists)
    ? existingData.payload.lists
    : []

  const alreadyIncluded = currentLists.some((item) => item?.id === list.id)
  const nextLists = alreadyIncluded ? currentLists : [list, ...currentLists].slice(0, 20)
  const nextCount = alreadyIncluded
    ? Number.isFinite(existingData?.payload?.count)
      ? existingData.payload.count
      : nextLists.length
    : (Number.isFinite(existingData?.payload?.count) ? existingData.payload.count : currentLists.length) + 1

  await updateDoc(existingSnapshot.ref, {
    payload: {
      count: nextCount,
      lists: nextLists,
    },
    fecha: Timestamp.now(),
  })
}
