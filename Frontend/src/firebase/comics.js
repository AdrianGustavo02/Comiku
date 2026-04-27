import { addDoc, collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const COMICS_COLLECTION = 'comics'
const VOLUMES_SUBCOLLECTION = 'tomos'

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
