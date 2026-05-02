import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const COMICS_COLLECTION = 'comics'
const VOLUMES_SUBCOLLECTION = 'tomos'
const REVIEWS_SUBCOLLECTION = 'Reseñas'

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.',
    )
  }
}

export async function createComic({
  nombre,
  autores,
  editorial,
  paisEditorial,
  estado,
  generos,
  descripcion,
  formato,
}) {
  ensureFirestoreReady()

  const comicPayload = {
    Nombre: nombre,
    Autor: autores,
    Editorial: editorial,
    PaisEditorial: paisEditorial,
    Estado: estado,
    Genero: generos,
    Descripcion: descripcion,
    Formato: formato,
    PromedioCalificacion: null,
    CantidadCalificaciones: null,
  }

  const comicReference = await addDoc(collection(db, COMICS_COLLECTION), comicPayload)

  return comicReference.id
}

export async function addComicVolume({
  comicId,
  numeroTomo,
  tomoUnico,
  isbn,
  fechaPublicacion,
  portada,
}) {
  ensureFirestoreReady()

  if (!comicId) {
    throw new Error('No se pudo guardar el tomo: comic inválido.')
  }

  const volumePayload = {
    NumeroTomo: numeroTomo ?? null,
    TomoUnico: tomoUnico ?? null,
    ISBN: isbn,
    FechaPublicacion: fechaPublicacion ?? null,
    Portada: portada,
  }

  await addDoc(
    collection(db, COMICS_COLLECTION, comicId, VOLUMES_SUBCOLLECTION),
    volumePayload,
  )
}

function mapComicSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    nombre: data.Nombre || '',
    autores: Array.isArray(data.Autor) ? data.Autor : [],
    editorial: data.Editorial || '',
    paisEditorial: data.PaisEditorial || '',
    estado: data.Estado || '',
    generos: Array.isArray(data.Genero) ? data.Genero : [],
    descripcion: data.Descripcion || '',
    formato: data.Formato || '',
    promedioCalificacion:
      data.PromedioCalificacion === undefined || data.PromedioCalificacion === null
        ? null
        : data.PromedioCalificacion,
    cantidadCalificaciones:
      data.CantidadCalificaciones === undefined || data.CantidadCalificaciones === null
        ? 0
        : data.CantidadCalificaciones,
  }
}

function mapVolumeSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    numeroTomo: data.NumeroTomo ?? null,
    tomoUnico: Boolean(data.TomoUnico),
    isbn: data.ISBN ?? null,
    fechaPublicacion: data.FechaPublicacion || '',
    portada: data.Portada || null,
  }
}

export async function getAllComics() {
  ensureFirestoreReady()

  const snapshots = await getDocs(collection(db, COMICS_COLLECTION))
  const comics = snapshots.docs.map(mapComicSnapshot)

  return comics.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function getComicById(comicId) {
  ensureFirestoreReady()

  if (!comicId) {
    throw new Error('No se pudo obtener el comic: ID inválido.')
  }

  const snapshot = await getDoc(doc(db, COMICS_COLLECTION, comicId))

  if (!snapshot.exists()) {
    return null
  }

  return mapComicSnapshot(snapshot)
}

export async function getComicVolumes(comicId) {
  ensureFirestoreReady()

  if (!comicId) {
    throw new Error('No se pudieron obtener los tomos: comic inválido.')
  }

  const snapshots = await getDocs(
    collection(db, COMICS_COLLECTION, comicId, VOLUMES_SUBCOLLECTION),
  )

  const volumes = snapshots.docs.map(mapVolumeSnapshot)

  return volumes.sort((a, b) => {
    if (a.numeroTomo === null && b.numeroTomo === null) {
      return 0
    }

    if (a.numeroTomo === null) {
      return 1
    }

    if (b.numeroTomo === null) {
      return -1
    }

    return a.numeroTomo - b.numeroTomo
  })
}

export async function getComicVolumeById({ comicId, volumeId }) {
  ensureFirestoreReady()

  if (!comicId || !volumeId) {
    throw new Error('No se pudo obtener el tomo: datos inválidos.')
  }

  const snapshot = await getDoc(
    doc(db, COMICS_COLLECTION, comicId, VOLUMES_SUBCOLLECTION, volumeId),
  )

  if (!snapshot.exists()) {
    return null
  }

  return mapVolumeSnapshot(snapshot)
}

function mapReviewSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    usuarioId: data.UsuarioId || '',
    descripcion: data.Descripcion || '',
    calificacion: data.Calificacion ?? null,
    fecha: data.Fecha && data.Fecha.toDate ? data.Fecha.toDate() : null,
  }
}

export async function getUserReview(comicId, usuarioId) {
  ensureFirestoreReady()

  if (!comicId || !usuarioId) return null

  const q = query(
    collection(db, COMICS_COLLECTION, comicId, REVIEWS_SUBCOLLECTION),
    where('UsuarioId', '==', usuarioId),
    limit(1),
  )

  const snapshots = await getDocs(q)

  if (snapshots.empty) return null

  return mapReviewSnapshot(snapshots.docs[0])
}

export async function getComicReviews(comicId, pageSize = 10, startAfterId = null) {
  ensureFirestoreReady()

  if (!comicId) {
    throw new Error('No se pudieron obtener las reseñas: comic inválido.')
  }

  const reviewsCollection = collection(db, COMICS_COLLECTION, comicId, REVIEWS_SUBCOLLECTION)

  let q

  if (startAfterId) {
    const lastDoc = await getDoc(doc(reviewsCollection, startAfterId))
    if (!lastDoc.exists()) {
      q = query(reviewsCollection, orderBy('Fecha', 'desc'), limit(pageSize))
    } else {
      q = query(
        reviewsCollection,
        orderBy('Fecha', 'desc'),
        startAfter(lastDoc),
        limit(pageSize),
      )
    }
  } else {
    q = query(reviewsCollection, orderBy('Fecha', 'desc'), limit(pageSize))
  }

  const snapshots = await getDocs(q)

  const reviews = snapshots.docs.map(mapReviewSnapshot)

  const last = snapshots.docs.length > 0 ? snapshots.docs[snapshots.docs.length - 1].id : null

  const hasMore = snapshots.docs.length === pageSize

  return { reviews, lastId: last, hasMore }
}

export async function addReview({ comicId, usuarioId, descripcion, calificacion }) {
  ensureFirestoreReady()

  if (!comicId || !usuarioId) {
    throw new Error('No se pudo guardar la reseña: datos inválidos.')
  }

  const payload = {
    UsuarioId: usuarioId,
    Descripcion: descripcion,
    Calificacion: calificacion,
    Fecha: serverTimestamp(),
  }

  const reviewRef = await addDoc(
    collection(db, COMICS_COLLECTION, comicId, REVIEWS_SUBCOLLECTION),
    payload,
  )

  // actualizar agregados en el documento del comic
  const comicRef = doc(db, COMICS_COLLECTION, comicId)
  const comicSnap = await getDoc(comicRef)
  const data = comicSnap.exists() ? comicSnap.data() : {}

  const currentCount = data.CantidadCalificaciones ?? 0
  const currentAvg = data.PromedioCalificacion ?? null

  const newCount = (currentCount || 0) + 1
  const newAvg = currentAvg === null || currentAvg === undefined
    ? calificacion
    : (currentAvg * currentCount + calificacion) / newCount

  await updateDoc(comicRef, {
    CantidadCalificaciones: newCount,
    PromedioCalificacion: newAvg,
  })

  return reviewRef.id
}

export async function updateReview({ comicId, reviewId, descripcion, calificacion }) {
  ensureFirestoreReady()

  if (!comicId || !reviewId) {
    throw new Error('No se pudo actualizar la reseña: datos inválidos.')
  }

  const reviewRef = doc(db, COMICS_COLLECTION, comicId, REVIEWS_SUBCOLLECTION, reviewId)
  const reviewSnap = await getDoc(reviewRef)

  if (!reviewSnap.exists()) {
    throw new Error('Reseña no encontrada.')
  }

  const oldData = reviewSnap.data()
  const oldCal = oldData.Calificacion ?? 0

  await updateDoc(reviewRef, {
    Descripcion: descripcion,
    Calificacion: calificacion,
    Fecha: serverTimestamp(),
  })

  // actualizar promedio en comic
  const comicRef = doc(db, COMICS_COLLECTION, comicId)
  const comicSnap = await getDoc(comicRef)
  const comicData = comicSnap.exists() ? comicSnap.data() : {}

  const count = comicData.CantidadCalificaciones ?? 0
  const avg = comicData.PromedioCalificacion ?? null

  if (count > 0 && avg !== null) {
    const newAvg = (avg * count - oldCal + calificacion) / count
    await updateDoc(comicRef, { PromedioCalificacion: newAvg })
  }
}

export async function deleteReview({ comicId, reviewId }) {
  ensureFirestoreReady()

  if (!comicId || !reviewId) {
    throw new Error('No se pudo eliminar la reseña: datos inválidos.')
  }

  const reviewRef = doc(db, COMICS_COLLECTION, comicId, REVIEWS_SUBCOLLECTION, reviewId)
  const reviewSnap = await getDoc(reviewRef)

  if (!reviewSnap.exists()) {
    throw new Error('Reseña no encontrada.')
  }

  const oldCal = reviewSnap.data().Calificacion ?? 0

  await deleteDoc(reviewRef)

  // actualizar promedio en comic
  const comicRef = doc(db, COMICS_COLLECTION, comicId)
  const comicSnap = await getDoc(comicRef)
  const comicData = comicSnap.exists() ? comicSnap.data() : {}

  const count = comicData.CantidadCalificaciones ?? 0
  const avg = comicData.PromedioCalificacion ?? null

  const newCount = count > 0 ? count - 1 : 0

  if (newCount === 0) {
    await updateDoc(comicRef, { CantidadCalificaciones: null, PromedioCalificacion: null })
  } else if (avg !== null) {
    const newAvg = (avg * count - oldCal) / newCount
    await updateDoc(comicRef, { CantidadCalificaciones: newCount, PromedioCalificacion: newAvg })
  }
}

export async function isbnExists(isbn) {
  ensureFirestoreReady()

  if (!isbn) {
    return false
  }

  const isbnNumber = Number.parseInt(String(isbn).trim(), 10)

  if (Number.isNaN(isbnNumber)) {
    return false
  }

  const comicsSnapshots = await getDocs(collection(db, COMICS_COLLECTION))

  for (const comicDoc of comicsSnapshots.docs) {
    const volumesSnapshots = await getDocs(
      collection(db, COMICS_COLLECTION, comicDoc.id, VOLUMES_SUBCOLLECTION),
    )

    for (const volumeDoc of volumesSnapshots.docs) {
      const data = volumeDoc.data()
      if (data.ISBN === isbnNumber) {
        return true
      }
    }
  }

  return false
}
