import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import { db, isFirebaseConfigured } from './firebase'

const REPORTS_COLLECTION = 'Reportes'
const REPORTS_ARCHIVE_DOC = 'Estados'
const RESOLVED_REPORTS_SUBCOLLECTION = 'Resueltos'
const DISMISSED_REPORTS_SUBCOLLECTION = 'Desestimados'
const REPORT_STATUS_PENDING = 'pendiente'
const REPORT_STATUS_RESOLVED = 'resuelto'
const REPORT_STATUS_DISMISSED = 'desestimado'
const REPORTABLE_OBJECT_NAMES = ['comic', 'tomo', 'usuario', 'grupo de chat']
const REPORT_REASON_OPTIONS_FOR_CONTENT = ['Informacion incorrecta', 'Contenido inapropiado']
const REPORT_REASON_OPTIONS_FOR_USER = ['Comportamiento inapropiado', 'Spam']
const REPORT_REASON_OPTIONS_FOR_GROUP = ['Contenido inapropiado', 'Spam']

function ensureFirestoreReady() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.',
    )
  }
}

function sanitizeText(input) {
  return sanitizeForbiddenInputChars(input).trim()
}

function buildReportKey({ usuarioIdReporta, objetoReportadoId, nombreObjetoReportado, comicId }) {
  const normalizedObjectName = String(nombreObjetoReportado || '').toLowerCase()
  const objectKey =
    normalizedObjectName === 'tomo'
      ? `${sanitizeText(comicId)}::${sanitizeText(objetoReportadoId)}`
      : sanitizeText(objetoReportadoId)

  return `${sanitizeText(usuarioIdReporta)}::${normalizedObjectName}::${objectKey}`
}

function validateReportPayload({
  usuarioIdReporta,
  objetoReportadoId,
  nombreObjetoReportado,
  motivo,
  descripcion,
  comicId = '',
}) {
  const normalizedObjectName = sanitizeText(nombreObjetoReportado).toLowerCase()
  const normalizedReason = sanitizeText(motivo)
  const normalizedDescription = sanitizeText(descripcion)
  const normalizedComicId = sanitizeText(comicId)

  if (!sanitizeText(usuarioIdReporta)) {
    throw new Error('No se pudo crear el reporte: usuario inválido.')
  }

  if (!sanitizeText(objetoReportadoId)) {
    throw new Error('No se pudo crear el reporte: objeto inválido.')
  }

  if (normalizedObjectName === 'tomo' && !normalizedComicId) {
    throw new Error('No se pudo crear el reporte: comic padre inválido.')
  }

  if (!REPORTABLE_OBJECT_NAMES.includes(normalizedObjectName)) {
    throw new Error('Tipo de objeto reportado inválido.')
  }

  if (!normalizedReason) {
    throw new Error('El motivo del reporte es obligatorio.')
  }

  if (
    (normalizedObjectName === 'comic' || normalizedObjectName === 'tomo') &&
    !REPORT_REASON_OPTIONS_FOR_CONTENT.includes(normalizedReason)
  ) {
    throw new Error('Selecciona un motivo válido para reportar este contenido.')
  }

  if (normalizedObjectName === 'usuario' && !REPORT_REASON_OPTIONS_FOR_USER.includes(normalizedReason)) {
    throw new Error('Selecciona un motivo válido para reportar este usuario.')
  }

  if (normalizedObjectName === 'grupo de chat' && !REPORT_REASON_OPTIONS_FOR_GROUP.includes(normalizedReason)) {
    throw new Error('Selecciona un motivo válido para reportar este grupo de chat.')
  }

  if (!normalizedDescription) {
    throw new Error('La descripcion del reporte es obligatoria.')
  }

  return {
    usuarioIdReporta: sanitizeText(usuarioIdReporta),
    objetoReportadoId: sanitizeText(objetoReportadoId),
    nombreObjetoReportado: normalizedObjectName,
    comicId: normalizedComicId,
    motivo: normalizedReason,
    descripcion: normalizedDescription,
  }
}

export async function hasPendingObjectReport({
  usuarioIdReporta,
  objetoReportadoId,
  nombreObjetoReportado,
  comicId = '',
}) {
  ensureFirestoreReady()

  const usuarioId = sanitizeText(usuarioIdReporta)
  const objetoId = sanitizeText(objetoReportadoId)
  const objectName = sanitizeText(nombreObjetoReportado).toLowerCase()
  const normalizedComicId = sanitizeText(comicId)

  if (!usuarioId || !objetoId || !objectName) {
    return false
  }

  const reportKey = buildReportKey({
    usuarioIdReporta: usuarioId,
    objetoReportadoId: objetoId,
    nombreObjetoReportado: objectName,
    comicId: normalizedComicId,
  })

  const reportQuery = query(
    collection(db, REPORTS_COLLECTION),
    where('ClaveReporte', '==', reportKey),
  )

  const snapshots = await getDocs(reportQuery)

  return snapshots.docs.some((snapshot) => {
    const data = snapshot.data()
    return (data.Estado || '').toLowerCase() === REPORT_STATUS_PENDING
  })
}

export async function createReport({
  usuarioIdReporta,
  objetoReportadoId,
  nombreObjetoReportado,
  motivo,
  descripcion,
  comicId = '',
  capturaPantalla = null,
}) {
  ensureFirestoreReady()

  const validatedPayload = validateReportPayload({
    usuarioIdReporta,
    objetoReportadoId,
    nombreObjetoReportado,
    motivo,
    descripcion,
    comicId,
  })

  const hasPending = await hasPendingObjectReport(validatedPayload)

  if (hasPending) {
    throw new Error('Ya tienes un reporte pendiente para este elemento.')
  }

  const payload = {
    UserID: validatedPayload.usuarioIdReporta,
    ObjetoReportadoID: validatedPayload.objetoReportadoId,
    NombreObjetoReportado: validatedPayload.nombreObjetoReportado,
    ClaveReporte: buildReportKey(validatedPayload),
    Motivo: validatedPayload.motivo,
    Descripcion: validatedPayload.descripcion,
    CapturaPantalla: capturaPantalla,
    Estado: REPORT_STATUS_PENDING,
    FechaReporte: serverTimestamp(),
  }

  // Añadir `ComicId` solo si aplica (cuando se reporta un tomo),
  // para evitar campos semánticamente incorrectos en reports de usuarios/comics.
  if (validatedPayload.nombreObjetoReportado === 'tomo') {
    payload.ComicId = validatedPayload.comicId
  }

  const reportReference = await addDoc(collection(db, REPORTS_COLLECTION), payload)

  return reportReference.id
}

function getArchiveCollection(status) {
  const subcollectionName =
    status === REPORT_STATUS_RESOLVED
      ? RESOLVED_REPORTS_SUBCOLLECTION
      : DISMISSED_REPORTS_SUBCOLLECTION

  return collection(db, REPORTS_COLLECTION, REPORTS_ARCHIVE_DOC, subcollectionName)
}

function mapReportSnapshot(snapshot) {
  const data = snapshot.data()

  return {
    id: snapshot.id,
    usuarioIdReporta: data.UserID || '',
    objetoReportadoId: data.ObjetoReportadoID || '',
    comicId: data.ComicId || '',
    nombreObjetoReportado: data.NombreObjetoReportado || '',
    motivo: data.Motivo || '',
    descripcion: data.Descripcion || '',
    capturaPantalla: data.CapturaPantalla || null,
    estado: data.Estado || '',
    fechaReporte: data.FechaReporte && data.FechaReporte.toDate ? data.FechaReporte.toDate() : null,
    fechaResolucion:
      data.FechaResolucion && data.FechaResolucion.toDate
        ? data.FechaResolucion.toDate()
        : null,
    fechaDesestimacion:
      data.FechaDesestimacion && data.FechaDesestimacion.toDate
        ? data.FechaDesestimacion.toDate()
        : null,
    administradorId: data.AdministradorId || '',
    claveReporte: data.ClaveReporte || '',
  }
}

async function getReportsPageFromCollection(collectionReference, pageSize = 10, startAfterId = null) {
  let reportQuery

  if (startAfterId) {
    const lastDoc = await getDoc(doc(collectionReference, startAfterId))

    if (!lastDoc.exists()) {
      reportQuery = query(collectionReference, orderBy('FechaReporte', 'desc'), limit(pageSize))
    } else {
      reportQuery = query(
        collectionReference,
        orderBy('FechaReporte', 'desc'),
        startAfter(lastDoc),
        limit(pageSize),
      )
    }
  } else {
    reportQuery = query(collectionReference, orderBy('FechaReporte', 'desc'), limit(pageSize))
  }

  const snapshots = await getDocs(reportQuery)
  const reports = snapshots.docs.map(mapReportSnapshot)
  const lastId = snapshots.docs.length > 0 ? snapshots.docs[snapshots.docs.length - 1].id : null

  return {
    reports,
    lastId,
    hasMore: snapshots.docs.length === pageSize,
  }
}

export async function getPendingReports(pageSize = 10, startAfterId = null) {
  ensureFirestoreReady()

  return getReportsPageFromCollection(collection(db, REPORTS_COLLECTION), pageSize, startAfterId)
}

export async function getResolvedReports(pageSize = 10, startAfterId = null) {
  ensureFirestoreReady()

  return getReportsPageFromCollection(getArchiveCollection(REPORT_STATUS_RESOLVED), pageSize, startAfterId)
}

export async function getDismissedReports(pageSize = 10, startAfterId = null) {
  ensureFirestoreReady()

  return getReportsPageFromCollection(getArchiveCollection(REPORT_STATUS_DISMISSED), pageSize, startAfterId)
}

async function archiveReport({ reportId, adminId, status }) {
  ensureFirestoreReady()

  if (!reportId || !adminId) {
    throw new Error('No se pudo actualizar el reporte: datos inválidos.')
  }

  const reportReference = doc(db, REPORTS_COLLECTION, reportId)
  const reportSnapshot = await getDoc(reportReference)

  if (!reportSnapshot.exists()) {
    throw new Error('No se encontró el reporte.')
  }

  const reportData = reportSnapshot.data()

  if ((reportData.Estado || '') !== REPORT_STATUS_PENDING) {
    throw new Error('Este reporte ya fue procesado.')
  }

  const archivedPayload = {
    ...reportData,
    Estado: status,
    AdministratorUserID: adminId,
    FechaResolucion: status === REPORT_STATUS_RESOLVED ? Timestamp.now() : null,
    FechaDesestimacion: status === REPORT_STATUS_DISMISSED ? Timestamp.now() : null,
  }

  const archiveCollection = getArchiveCollection(status)

  await setDoc(doc(archiveCollection, reportId), archivedPayload)
  await deleteDoc(reportReference)

  return mapReportSnapshot({ id: reportId, data: () => archivedPayload })
}

export async function resolveReport({ reportId, adminId }) {
  return archiveReport({ reportId, adminId, status: REPORT_STATUS_RESOLVED })
}

export async function dismissReport({ reportId, adminId }) {
  return archiveReport({ reportId, adminId, status: REPORT_STATUS_DISMISSED })
}

export { REPORT_REASON_OPTIONS_FOR_CONTENT, REPORT_REASON_OPTIONS_FOR_USER, REPORT_REASON_OPTIONS_FOR_GROUP }