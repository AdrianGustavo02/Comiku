import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { createComic, addComicVolume, isbnExists } from './comics'

const PENDING_COLLECTION = 'creaciones_pendientes'

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.')
  }
}

export async function addPendingCreation(payload) {
  ensureFirestoreReady()

  const now = Timestamp.now()

  //Normalizo el payload para asegurar que tenga los campos necesarios y un formato consistente.
  const normalized = {
    ...payload,
    estado: 'pendiente',
    fechaEnvio: now,
  }

  if (payload.remitenteUid && !payload.UserID) {
    normalized.UserID = payload.remitenteUid
  }


  delete normalized.remitenteUid
  delete normalized.remitenteNick

  const docRef = await addDoc(collection(db, PENDING_COLLECTION), normalized)

  return docRef.id
}

export async function listPendingCreations() {
  ensureFirestoreReady()

  const snaps = await getDocs(collection(db, PENDING_COLLECTION))

  return snaps.docs.map((s) => ({ id: s.id, ...s.data() }))
}

export async function getPendingCreationById(id) {
  ensureFirestoreReady()

  if (!id) throw new Error('ID inválido')

  const snap = await getDoc(doc(db, PENDING_COLLECTION, id))

  if (!snap.exists()) return null

  return { id: snap.id, ...snap.data() }
}

export async function deletePendingCreation(id) {
  ensureFirestoreReady()

  if (!id) throw new Error('ID inválido')

  await deleteDoc(doc(db, PENDING_COLLECTION, id))
}

export async function updatePendingCreation(id, payload) {
  ensureFirestoreReady()

  if (!id) throw new Error('ID inválido')

  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload inválido para actualizar la creación pendiente.')
  }

  await updateDoc(doc(db, PENDING_COLLECTION, id), payload)
}

export async function approvePendingCreation(id) {
  ensureFirestoreReady()

  const pending = await getPendingCreationById(id)

  if (!pending) throw new Error('Creación pendiente no encontrada')

  //pending.tipo = Tipo de creación (ej: 'comic_y_tomos').
  //pending.metadata: Objeto con los datos para crear el comic.
  //pending.tomos: Array de objetos con los datos de cada tomo a agregar al comic.
  let targetComicId = pending.comicId || null

  if (pending.tipo === 'comic_y_tomos') {
    //Creo un comic usando la metadata.
    const comicDraft = pending.metadata || {}
    targetComicId = await createComic({
      nombre: comicDraft.nombre,
      autores: comicDraft.autores,
      editorial: comicDraft.editorial,
      paisEditorial: comicDraft.paisEditorial,
      estado: comicDraft.estado,
      generos: comicDraft.generos,
      descripcion: comicDraft.descripcion,
      formato: comicDraft.formato,
    })
  }

  if (!targetComicId) {
    throw new Error('No se pudo determinar el comic destino para los tomos')
  }

  //Agrego los tomos al comic.
  const tomos = Array.isArray(pending.tomos) ? pending.tomos : []

  //Valido los ISBNs antes de agregar cualquier tomo.
  //-Detecto ISBNs duplicados dentro del mismo envío
  //-Detecto ISBNs que ya existen en la base de datos
  const isbnIndexMap = {}
  const internalConflicts = {}
  const existingConflicts = {}

  for (let i = 0; i < tomos.length; i++) {
    const tomo = tomos[i]
    const rawIsbn = tomo.isbn
    const isbnNum = rawIsbn ? Number.parseInt(String(rawIsbn).trim(), 10) : null
    if (!isbnNum) continue

    if (!isbnIndexMap[isbnNum]) isbnIndexMap[isbnNum] = []
    isbnIndexMap[isbnNum].push(i + 1)
  }

  for (const [isbn, indices] of Object.entries(isbnIndexMap)) {
    if (Array.isArray(indices) && indices.length > 1) {
      internalConflicts[isbn] = indices
    }
  }


  for (const isbnStr of Object.keys(isbnIndexMap)) {
    const isbnValue = Number.parseInt(isbnStr, 10)
    try {
      const exists = await isbnExists(isbnValue)
      if (exists) existingConflicts[isbnValue] = isbnIndexMap[isbnStr]
    } catch {
    }
  }

  if (Object.keys(internalConflicts).length > 0 || Object.keys(existingConflicts).length > 0) {
    const parts = ['No se puede aprobar la creación debido a conflictos de ISBN:']

    if (Object.keys(internalConflicts).length > 0) {
      parts.push('\nConflictos dentro del envío:')
      for (const [isbn, indices] of Object.entries(internalConflicts)) {
        parts.push(`- ISBN ${isbn} aparece en los tomos: ${indices.join(', ')}`)
      }
    }

    if (Object.keys(existingConflicts).length > 0) {
      parts.push('\nConflictos con la base de datos existente:')
      for (const [isbn, indices] of Object.entries(existingConflicts)) {
        parts.push(`- ISBN ${isbn} (tomo(s) ${indices.join(', ')}) ya existe en la base de datos.`)
      }
    }

    parts.push('\nAcciones sugeridas:')
    parts.push('- Editar los tomos conflictivos y corregir/eliminar el ISBN duplicado.')
    parts.push('- Desestimar la creación si los cambios no son deseados.')
    parts.push('- Tras corregir, reintentar la aprobación.')

    throw new Error(parts.join('\n'))
  }

  for (const tomo of tomos) {
    await addComicVolume({
      comicId: targetComicId,
      numeroTomo: tomo.numeroTomo,
      tomoUnico: tomo.tomoUnico,
      isbn: tomo.isbn,
      fechaPublicacion: tomo.fechaPublicacion,
      portada: tomo.portada,
    })
  }


  await deletePendingCreation(id)

  return { comicId: targetComicId, addedVolumes: tomos.length }
}
