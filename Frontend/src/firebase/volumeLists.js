import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { getComicById, getComicVolumeById } from './comics'

const USER_COLLECTION = 'usuario'
const LIBRARY_COLLECTION = 'biblioteca'
const WISHLIST_COLLECTION = 'listaDeseados'
const LIST_ROOT_DOCUMENT = 'coleccion'
const COMICS_SUBCOLLECTION = 'comics'
const VOLUMES_SUBCOLLECTION = 'tomos'

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.')
  }
}

function getComicReference({ uid, listCollection, comicId }) {
  return doc(
    db,
    USER_COLLECTION,
    uid,
    listCollection,
    LIST_ROOT_DOCUMENT,
    COMICS_SUBCOLLECTION,
    comicId,
  )
}

function getVolumeReference({ uid, listCollection, comicId, volumeId }) {
  const comicReference = getComicReference({ uid, listCollection, comicId })
  return doc(comicReference, VOLUMES_SUBCOLLECTION, volumeId)
}

function normalizeDate(value) {
  if (!value) {
    return null
  }

  if (typeof value === 'object' && value !== null) {
    if (value.date) {
      return normalizeDate(value.date)
    }

    if (value.fecha) {
      return normalizeDate(value.fecha)
    }
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate()
  }

  if (value instanceof Date) {
    return value
  }

  return null
}

function normalizeReadingEntries(values) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value, index) => {
      const date = normalizeDate(value)

      if (!date) {
        return null
      }

      return {
        storageIndex: index,
        id:
          value && typeof value === 'object' && 'id' in value
            ? String(value.id)
            : `${date.getTime()}-${index}`,
        date,
        raw: value,
      }
    })
    .filter(Boolean)
}

function createReadingEntry(readingDate) {
  return {
    id: `${readingDate.getTime()}-${Math.random().toString(16).slice(2)}`,
    date: Timestamp.fromDate(readingDate),
  }
}

async function getVolumeStatus({ uid, listCollection, comicId, volumeId }) {
  const volumeReference = getVolumeReference({
    uid,
    listCollection,
    comicId,
    volumeId,
  })

  const snapshot = await getDoc(volumeReference)

  return snapshot.exists()
}

export async function getVolumeMembership({ uid, comicId, volumeId }) {
  ensureFirestoreReady()

  if (!uid || !comicId || !volumeId) {
    throw new Error('No se pudo revisar la lista: datos inválidos.')
  }

  const [inLibrary, inWishlist] = await Promise.all([
    getVolumeStatus({
      uid,
      listCollection: LIBRARY_COLLECTION,
      comicId,
      volumeId,
    }),
    getVolumeStatus({
      uid,
      listCollection: WISHLIST_COLLECTION,
      comicId,
      volumeId,
    }),
  ])

  return {
    inLibrary,
    inWishlist,
  }
}

export async function getLibraryVolumeData({ uid, comicId, volumeId }) {
  ensureFirestoreReady()

  if (!uid || !comicId || !volumeId) {
    throw new Error('No se pudo obtener la información de lectura: datos inválidos.')
  }

  const volumeReference = getVolumeReference({
    uid,
    listCollection: LIBRARY_COLLECTION,
    comicId,
    volumeId,
  })

  const snapshot = await getDoc(volumeReference)

  if (!snapshot.exists()) {
    return {
      inLibrary: false,
      leido: false,
      fechaLectura: [],
      readingEntries: [],
    }
  }

  const data = snapshot.data()
  const readingEntries = normalizeReadingEntries(data.FechaLectura)
  const fechaLectura = readingEntries.map((entry) => entry.date)

  return {
    inLibrary: true,
    leido: Boolean(data.Leido) || readingEntries.length > 0,
    fechaLectura,
    readingEntries,
  }
}

async function deleteComicIfEmpty(comicReference) {
  const volumeSnapshots = await getDocs(collection(comicReference, VOLUMES_SUBCOLLECTION))

  if (volumeSnapshots.size === 0) {
    await deleteDoc(comicReference)
  }
}

async function toggleVolumeInList({ uid, comicId, volumeId, targetList }) {
  ensureFirestoreReady()

  if (!uid || !comicId || !volumeId) {
    throw new Error('No se pudo actualizar la lista: datos inválidos.')
  }

  const sourceList =
    targetList === LIBRARY_COLLECTION ? WISHLIST_COLLECTION : LIBRARY_COLLECTION

  const targetComicReference = getComicReference({
    uid,
    listCollection: targetList,
    comicId,
  })
  const sourceComicReference = getComicReference({
    uid,
    listCollection: sourceList,
    comicId,
  })

  const targetVolumeReference = doc(targetComicReference, VOLUMES_SUBCOLLECTION, volumeId)
  const sourceVolumeReference = doc(sourceComicReference, VOLUMES_SUBCOLLECTION, volumeId)

  const [targetVolumeSnapshot, sourceVolumeSnapshot] = await Promise.all([
    getDoc(targetVolumeReference),
    getDoc(sourceVolumeReference),
  ])

  const shouldRemoveFromTarget = targetVolumeSnapshot.exists()
  const shouldRemoveFromSource = sourceVolumeSnapshot.exists()

  const batch = writeBatch(db)

  if (shouldRemoveFromTarget) {
    batch.delete(targetVolumeReference)
  } else {
    batch.set(
      targetComicReference,
      {
        FechaAgregado: Timestamp.now(),
      },
      { merge: true },
    )

    if (targetList === LIBRARY_COLLECTION) {
      batch.set(
        targetVolumeReference,
        {
          FechaLectura: [],
          Leido: false,
        },
        { merge: true },
      )
    } else {
      batch.set(
        targetVolumeReference,
        {
          FechaAgregado: Timestamp.now(),
        },
        { merge: true },
      )
    }
  }

  if (!shouldRemoveFromTarget && shouldRemoveFromSource) {
    batch.delete(sourceVolumeReference)
  }

  await batch.commit()

  if (shouldRemoveFromTarget) {
    await deleteComicIfEmpty(targetComicReference)
  }

  if (!shouldRemoveFromTarget && shouldRemoveFromSource) {
    await deleteComicIfEmpty(sourceComicReference)
  }

  if (targetList === LIBRARY_COLLECTION) {
    return {
      inLibrary: !shouldRemoveFromTarget,
      inWishlist: shouldRemoveFromTarget ? shouldRemoveFromSource : false,
    }
  }

  return {
    inLibrary: shouldRemoveFromTarget ? shouldRemoveFromSource : false,
    inWishlist: !shouldRemoveFromTarget,
  }
}

export async function toggleVolumeInLibrary({ uid, comicId, volumeId }) {
  return toggleVolumeInList({
    uid,
    comicId,
    volumeId,
    targetList: LIBRARY_COLLECTION,
  })
}

export async function toggleVolumeInWishlist({ uid, comicId, volumeId }) {
  return toggleVolumeInList({
    uid,
    comicId,
    volumeId,
    targetList: WISHLIST_COLLECTION,
  })
}

export async function addVolumeReading({ uid, comicId, volumeId, readingDate }) {
  ensureFirestoreReady()

  if (!uid || !comicId || !volumeId || !(readingDate instanceof Date)) {
    throw new Error('No se pudo agregar la lectura: datos inválidos.')
  }

  const comicReference = getComicReference({
    uid,
    listCollection: LIBRARY_COLLECTION,
    comicId,
  })
  const volumeReference = getVolumeReference({
    uid,
    listCollection: LIBRARY_COLLECTION,
    comicId,
    volumeId,
  })

  const volumeSnapshot = await getDoc(volumeReference)

  if (!volumeSnapshot.exists()) {
    throw new Error('Solo puedes agregar lecturas a tomos que estén en tu biblioteca.')
  }

  const currentData = volumeSnapshot.data()
  const currentReadings = normalizeReadingEntries(currentData.FechaLectura)
  const nextReadingEntry = createReadingEntry(readingDate)
  const nextReadingEntries = [
    ...currentReadings.map((entry) => entry.raw),
    nextReadingEntry,
  ]

  const batch = writeBatch(db)

  batch.set(
    comicReference,
    {
      FechaAgregado: Timestamp.now(),
    },
    { merge: true },
  )

  batch.set(
    volumeReference,
    {
      FechaLectura: nextReadingEntries,
      Leido: true,
    },
    { merge: true },
  )

  await batch.commit()

  return getLibraryVolumeData({ uid, comicId, volumeId })
}

export async function deleteVolumeReading({ uid, comicId, volumeId, storageIndex }) {
  ensureFirestoreReady()

  if (!uid || !comicId || !volumeId || !Number.isInteger(storageIndex) || storageIndex < 0) {
    throw new Error('No se pudo eliminar la lectura: datos inválidos.')
  }

  const volumeReference = getVolumeReference({
    uid,
    listCollection: LIBRARY_COLLECTION,
    comicId,
    volumeId,
  })

  const snapshot = await getDoc(volumeReference)

  if (!snapshot.exists()) {
    throw new Error('Solo puedes eliminar lecturas de tomos que estén en tu biblioteca.')
  }

  const currentData = snapshot.data()
  const currentReadings = normalizeReadingEntries(currentData.FechaLectura)

  if (storageIndex >= currentReadings.length) {
    throw new Error('No se encontró la lectura solicitada.')
  }

  const nextReadingEntries = currentReadings
    .filter((entry) => entry.storageIndex !== storageIndex)
    .map((entry) => entry.raw)

  const batch = writeBatch(db)

  batch.set(
    volumeReference,
    {
      FechaLectura: nextReadingEntries,
      Leido: nextReadingEntries.length > 0,
    },
    { merge: true },
  )

  await batch.commit()

  return getLibraryVolumeData({ uid, comicId, volumeId })
}

async function getUserListItems({ uid, listCollection }) {
  ensureFirestoreReady()

  if (!uid) {
    throw new Error('No se pudo obtener la lista: usuario inválido.')
  }

  const comicSnapshots = await getDocs(
    collection(
      db,
      USER_COLLECTION,
      uid,
      listCollection,
      LIST_ROOT_DOCUMENT,
      COMICS_SUBCOLLECTION,
    ),
  )

  const groupedItems = await Promise.all(
    comicSnapshots.docs.map(async (comicSnapshot) => {
      const comicId = comicSnapshot.id
      const comicData = await getComicById(comicId)

      if (!comicData) {
        return null
      }

      const volumeSnapshots = await getDocs(
        collection(comicSnapshot.ref, VOLUMES_SUBCOLLECTION),
      )

      const volumeItems = await Promise.all(
        volumeSnapshots.docs.map(async (volumeSnapshot) => {
          const volumeId = volumeSnapshot.id
          const volumeData = await getComicVolumeById({ comicId, volumeId })

          if (!volumeData) {
            return null
          }

          const listVolumeData = volumeSnapshot.data()

          return {
            id: volumeId,
            numeroTomo: volumeData.numeroTomo,
            tomoUnico: volumeData.tomoUnico,
            isbn: volumeData.isbn,
            fechaPublicacion: volumeData.fechaPublicacion,
            portada: volumeData.portada,
            fechaLectura: Array.isArray(listVolumeData.FechaLectura)
              ? listVolumeData.FechaLectura.map(normalizeDate).filter(Boolean)
              : [],
            leido: Boolean(listVolumeData.Leido),
            fechaAgregado: normalizeDate(listVolumeData.FechaAgregado),
          }
        }),
      )

      return {
        comicId,
        comic: comicData,
        fechaAgregadoComic: normalizeDate(comicSnapshot.data().FechaAgregado),
        volumes: volumeItems.filter(Boolean),
      }
    }),
  )

  return groupedItems
    .filter(Boolean)
    .filter((groupedItem) => groupedItem.volumes.length > 0)
    .sort((a, b) => a.comic.nombre.localeCompare(b.comic.nombre, 'es'))
}

export async function getUserLibraryItems({ uid }) {
  return getUserListItems({
    uid,
    listCollection: LIBRARY_COLLECTION,
  })
}

export async function getUserWishlistItems({ uid }) {
  return getUserListItems({
    uid,
    listCollection: WISHLIST_COLLECTION,
  })
}