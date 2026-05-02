import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const THEMATIC_LISTS_COLLECTION = 'listasTematicas'
const VOLUMES_SUBCOLLECTION = 'tomosDeLista'
const COMMENTS_SUBCOLLECTION = 'comentarios'
const LIKES_SUBCOLLECTION = 'likes'
const USER_COLLECTION = 'usuario'

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.',
    )
  }
}

function mapThematicListSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    userId: data.UserId || '',
    nombre: data.Nombre || '',
    descripcion: data.Descripcion || '',
    cantidadLikes: data.CantidadLikes ?? 0,
    cantidadComentarios: data.CantidadComentarios ?? 0,
    fechaCreacion: data.FechaCreacion || null,
    esGuiaDeLectura: Boolean(data.EsGuiaDeLectura),
    fotosDePortadas: Array.isArray(data.FotosDePortadas) ? data.FotosDePortadas : [],
  }
}

function mapThematicListVolumeSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    comicId: data.ComicId || '',
    volumeId: data.VolumeId || '',
    orden: data.Orden ?? 0,
  }
}

function mapCommentSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    userId: data.UserId || '',
    comentario: data.Comentario || '',
    fechaComentario: data.FechaComentario || null,
  }
}

export async function createThematicList({
  userId,
  nombre,
  descripcion,
  esGuiaDeLectura,
}) {
  ensureFirestoreReady()

  if (!userId || !nombre) {
    throw new Error('Usuario y nombre de lista son obligatorios.')
  }

  const listPayload = {
    UserId: userId,
    Nombre: nombre,
    Descripcion: descripcion || '',
    CantidadLikes: 0,
    CantidadComentarios: 0,
    FechaCreacion: Timestamp.now(),
    EsGuiaDeLectura: Boolean(esGuiaDeLectura),
    FotosDePortadas: [],
  }

  const listReference = await addDoc(collection(db, THEMATIC_LISTS_COLLECTION), listPayload)

  return listReference.id
}

export async function updateThematicList({
  listId,
  nombre,
  descripcion,
  esGuiaDeLectura,
}) {
  ensureFirestoreReady()

  if (!listId || !nombre) {
    throw new Error('ID de lista y nombre son obligatorios.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)

  await updateDoc(listReference, {
    Nombre: nombre,
    Descripcion: descripcion || '',
    EsGuiaDeLectura: Boolean(esGuiaDeLectura),
  })
}

export async function deleteThematicList({ listId }) {
  ensureFirestoreReady()

  if (!listId) {
    throw new Error('ID de lista es obligatorio.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)

  await deleteDoc(listReference)
}

export async function getThematicListById({ listId }) {
  ensureFirestoreReady()

  if (!listId) {
    throw new Error('ID de lista es obligatorio.')
  }

  const snapshot = await getDoc(doc(db, THEMATIC_LISTS_COLLECTION, listId))

  if (!snapshot.exists()) {
    return null
  }

  return mapThematicListSnapshot(snapshot)
}

export async function getUserThematicLists({ userId }) {
  ensureFirestoreReady()

  if (!userId) {
    throw new Error('ID de usuario es obligatorio.')
  }

  const q = query(
    collection(db, THEMATIC_LISTS_COLLECTION),
    where('UserId', '==', userId),
  )

  const snapshots = await getDocs(q)

  return snapshots.docs
    .map(mapThematicListSnapshot)
    .sort((a, b) => {
      const dateA = a.fechaCreacion instanceof Date ? a.fechaCreacion : new Date(0)
      const dateB = b.fechaCreacion instanceof Date ? b.fechaCreacion : new Date(0)
      return dateB.getTime() - dateA.getTime()
    })
}

export async function getAllThematicLists() {
  ensureFirestoreReady()

  const snapshots = await getDocs(collection(db, THEMATIC_LISTS_COLLECTION))

  return snapshots.docs
    .map(mapThematicListSnapshot)
    .sort((a, b) => {
      const dateA = a.fechaCreacion instanceof Date ? a.fechaCreacion : new Date(0)
      const dateB = b.fechaCreacion instanceof Date ? b.fechaCreacion : new Date(0)
      return dateB.getTime() - dateA.getTime()
    })
    .slice(0, 20)
}

export async function addVolumeToList({ listId, comicId, volumeId, orden }) {
  ensureFirestoreReady()

  if (!listId || !comicId || !volumeId) {
    throw new Error('ID de lista, comic y tomo son obligatorios.')
  }
  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)

  // Evitar duplicados: buscar si ya existe un documento con ese VolumeId
  const existingQ = query(
    collection(listReference, VOLUMES_SUBCOLLECTION),
    where('VolumeId', '==', volumeId),
  )
  const existingSnapshots = await getDocs(existingQ)

  if (existingSnapshots.size > 0) {
    return existingSnapshots.docs[0].id
  }

  const volumePayload = {
    ComicId: comicId,
    VolumeId: volumeId,
    Orden: orden ?? 0,
  }

  const addedRef = await addDoc(collection(listReference, VOLUMES_SUBCOLLECTION), volumePayload)

  // Mantener un índice de tomos en el documento raíz para accesos rápidos
  try {
    await updateDoc(listReference, {
      tomosDeLista: arrayUnion(volumeId),
    })
  } catch {
    // ignorar errores de actualización de índice
  }

  return addedRef.id
}

export async function removeVolumeFromList({ listId, volumeId }) {
  ensureFirestoreReady()

  if (!listId || !volumeId) {
    throw new Error('ID de lista y tomo son obligatorios.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)

  // volumeId puede ser el id del documento subcolección o el VolumeId almacenado
  // Intentamos borrar por id de documento primero
  try {
    const candidateRef = doc(listReference, VOLUMES_SUBCOLLECTION, volumeId)
    const candidateSnap = await getDoc(candidateRef)

    if (candidateSnap.exists()) {
      const data = candidateSnap.data()
      await deleteDoc(candidateRef)

      try {
        await updateDoc(listReference, {
          tomosDeLista: arrayRemove(data.VolumeId),
        })
      } catch {}

      return
    }
  } catch {}

  // Si no existe, buscamos documentos donde VolumeId == volumeId
  const q = query(
    collection(listReference, VOLUMES_SUBCOLLECTION),
    where('VolumeId', '==', volumeId),
  )

  const snapshots = await getDocs(q)

  for (const snap of snapshots.docs) {
    const data = snap.data()
    await deleteDoc(doc(listReference, VOLUMES_SUBCOLLECTION, snap.id))

    try {
      await updateDoc(listReference, {
        tomosDeLista: arrayRemove(data.VolumeId),
      })
    } catch {}
  }
}

export async function getListVolumes({ listId }) {
  ensureFirestoreReady()

  if (!listId) {
    throw new Error('ID de lista es obligatorio.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)
  const snapshots = await getDocs(collection(listReference, VOLUMES_SUBCOLLECTION))

  return snapshots.docs
    .map(mapThematicListVolumeSnapshot)
    .sort((a, b) => a.orden - b.orden)
}

export async function updateListPhotos({ listId, fotosDePortadas }) {
  ensureFirestoreReady()

  if (!listId) {
    throw new Error('ID de lista es obligatorio.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)

  await updateDoc(listReference, {
    FotosDePortadas: fotosDePortadas,
  })
}

export async function addCommentToList({ listId, userId, comentario }) {
  ensureFirestoreReady()

  if (!listId || !userId || !comentario) {
    throw new Error('Lista, usuario y comentario son obligatorios.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)
  const commentPayload = {
    UserId: userId,
    Comentario: comentario,
    FechaComentario: Timestamp.now(),
  }

  await addDoc(collection(listReference, COMMENTS_SUBCOLLECTION), commentPayload)

  await updateDoc(listReference, {
    CantidadComentarios: (await getListComments({ listId })).length,
  })
}

export async function getListComments({ listId }) {
  ensureFirestoreReady()

  if (!listId) {
    throw new Error('ID de lista es obligatorio.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)
  const snapshots = await getDocs(collection(listReference, COMMENTS_SUBCOLLECTION))

  return snapshots.docs.map(mapCommentSnapshot)
}

export async function deleteCommentFromList({ listId, commentId, userId }) {
  ensureFirestoreReady()

  if (!listId || !commentId || !userId) {
    throw new Error('Lista, comentario y usuario son obligatorios.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)
  const commentReference = doc(listReference, COMMENTS_SUBCOLLECTION, commentId)
  const snapshot = await getDoc(commentReference)

  if (!snapshot.exists()) {
    throw new Error('No se encontró el comentario.')
  }

  const data = snapshot.data()

  if (data.UserId !== userId) {
    throw new Error('Solo puedes eliminar tus propios comentarios.')
  }

  await deleteDoc(commentReference)

  const remainingComments = await getListComments({ listId })

  await updateDoc(listReference, {
    CantidadComentarios: remainingComments.length,
  })
}

export async function toggleLikeForList({ listId, userId }) {
  ensureFirestoreReady()

  if (!listId || !userId) {
    throw new Error('ID de lista y usuario son obligatorios.')
  }

  const listReference = doc(db, THEMATIC_LISTS_COLLECTION, listId)
  const likeDocRef = doc(listReference, LIKES_SUBCOLLECTION, userId)
  const likeSnap = await getDoc(likeDocRef)

  if (likeSnap.exists()) {
    // quitar like
    await deleteDoc(likeDocRef)
    try {
      await updateDoc(listReference, {
        CantidadLikes: increment(-1),
      })
    } catch {}

    return { liked: false }
  }

  // agregar like
  await setDoc(likeDocRef, {
    UserId: userId,
    FechaLike: Timestamp.now(),
  })

  try {
    await updateDoc(listReference, {
      CantidadLikes: increment(1),
    })
  } catch {}

  return { liked: true }
}

export async function getUserLikeStatus({ listId, userId }) {
  ensureFirestoreReady()

  if (!listId || !userId) {
    return false
  }

  const likeDocRef = doc(doc(db, THEMATIC_LISTS_COLLECTION, listId), LIKES_SUBCOLLECTION, userId)
  const snap = await getDoc(likeDocRef)

  return snap.exists()
}

export async function toggleSaveListForUser({ listId, userId }) {
  ensureFirestoreReady()

  if (!listId || !userId) {
    throw new Error('ID de lista y usuario son obligatorios.')
  }

  const userSavedRef = doc(db, USER_COLLECTION, userId, 'listasGuardadas', listId)
  const snap = await getDoc(userSavedRef)

  if (snap.exists()) {
    await deleteDoc(userSavedRef)
    return { saved: false }
  }

  await setDoc(userSavedRef, {
    FechaGuardado: Timestamp.now(),
  })

  return { saved: true }
}

export async function getUserSavedListStatus({ listId, userId }) {
  ensureFirestoreReady()

  if (!listId || !userId) {
    return false
  }

  const savedDocRef = doc(db, USER_COLLECTION, userId, 'listasGuardadas', listId)
  const snapshot = await getDoc(savedDocRef)

  return snapshot.exists()
}
