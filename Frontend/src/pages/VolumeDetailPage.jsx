import { useEffect, useState } from 'react'
import { getComicById, getComicVolumeById } from '../firebase/comics'
import { deleteVolumeByAdmin } from '../firebase/comics'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_COVER_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import {
  createReport,
  hasPendingObjectReport,
  REPORT_REASON_OPTIONS_FOR_CONTENT,
} from '../firebase/reports'
import { getUserProfile } from '../firebase/user'
import {
  addVolumeReading,
  deleteVolumeReading,
  getLibraryVolumeData,
  getVolumeMembership,
  toggleVolumeInLibrary,
  toggleVolumeInWishlist,
} from '../firebase/volumeLists'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import '../styles/VolumeDetailPage.css'
import '../styles/Modal.css'
import FileInput from '../Components/FileInput'
import Button from '../Components/Button'
import NearbyBookstores from '../Components/NearbyBookstores'

function formatPublicationDate(publicationDate) {
  if (!publicationDate || !/^\d{4}-\d{2}$/.test(publicationDate)) {
    return publicationDate || 'No definida'
  }

  const [year, month] = publicationDate.split('-')
  return `${month}/${year}`
}

function formatReadingDate(readingDate) {
  if (!(readingDate instanceof Date)) {
    return 'Fecha no definida'
  }

  return readingDate.toLocaleDateString('es-AR')
}

function VolumeDetailPage({ comicId, volumeId, authUser, onEditVolume, onDeleteVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comic, setComic] = useState(null)
  const [volume, setVolume] = useState(null)
  const [listError, setListError] = useState('')
  const [listNotice, setListNotice] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [isUpdatingLibrary, setIsUpdatingLibrary] = useState(false)
  const [isUpdatingWishlist, setIsUpdatingWishlist] = useState(false)
  const [isAddingReading, setIsAddingReading] = useState(false)
  const [readingDate, setReadingDate] = useState('')
  const [readingToDelete, setReadingToDelete] = useState(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletingVolume, setDeletingVolume] = useState(false)
  const [membership, setMembership] = useState({
    inLibrary: false,
    inWishlist: false,
  })
  const [libraryData, setLibraryData] = useState({
    inLibrary: false,
    leido: false,
    fechaLectura: [],
    readingEntries: [],
  })
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [hasPendingVolumeReport, setHasPendingVolumeReport] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS_FOR_CONTENT[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportScreenshotFile, setReportScreenshotFile] = useState(null)
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState('')
  const [reportError, setReportError] = useState('')
  const [reportNotice, setReportNotice] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const sortedReadings = [...(Array.isArray(libraryData.readingEntries) ? libraryData.readingEntries : [])]
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  useEffect(() => {
    return () => {
      if (reportScreenshotPreview) {
        URL.revokeObjectURL(reportScreenshotPreview)
      }
    }
  }, [reportScreenshotPreview])

  useEffect(() => {
    let cancelled = false

    async function loadVolumeDetail() {
      if (!comicId || !volumeId) {
        setError('No se encontró el tomo solicitado.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const [comicData, volumeData] = await Promise.all([
          getComicById(comicId),
          getComicVolumeById({ comicId, volumeId }),
        ])

        if (cancelled) {
          return
        }

        if (!comicData || !volumeData) {
          setError('El tomo solicitado no existe o fue eliminado.')
          setComic(null)
          setVolume(null)
          return
        }

        setComic(comicData)
        setVolume(volumeData)
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el detalle del tomo.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadVolumeDetail()

    return () => {
      cancelled = true
    }
  }, [comicId, volumeId])

  useEffect(() => {
    let cancelled = false

    async function loadMembership() {
      if (!authUser?.uid || !comicId || !volumeId) {
        if (!cancelled) {
          setMembership({ inLibrary: false, inWishlist: false })
          setLibraryData({
            inLibrary: false,
            leido: false,
            fechaLectura: [],
            readingEntries: [],
          })
          setListLoading(false)
        }
        return
      }

      try {
        setListLoading(true)
        setListError('')

        const [nextMembership, nextLibraryData] = await Promise.all([
          getVolumeMembership({
            uid: authUser.uid,
            comicId,
            volumeId,
          }),
          getLibraryVolumeData({
            uid: authUser.uid,
            comicId,
            volumeId,
          }),
        ])

        if (!cancelled) {
          setMembership(nextMembership)
          setLibraryData(nextLibraryData)
        }
      } catch (requestError) {
        if (!cancelled) {
          setListError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar tu biblioteca y deseados.',
          )
        }
      } finally {
        if (!cancelled) {
          setListLoading(false)
        }
      }
    }

    loadMembership()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, comicId, volumeId])

  useEffect(() => {
    let cancelled = false

    async function loadReportState() {
      if (!authUser?.uid || !volumeId) {
        if (!cancelled) {
          setCurrentUserRole('')
          setHasPendingVolumeReport(false)
        }
        return
      }

      try {
        const profile = await getUserProfile(authUser.uid)
        if (!cancelled) {
          setCurrentUserRole(profile?.rol || '')
        }
      } catch {
        if (!cancelled) {
          setCurrentUserRole('')
        }
      }

      try {
        const hasPendingReport = await hasPendingObjectReport({
          usuarioIdReporta: authUser.uid,
          objetoReportadoId: volumeId,
          nombreObjetoReportado: 'tomo',
          comicId,
        })

        if (!cancelled) {
          setHasPendingVolumeReport(hasPendingReport)
        }
      } catch {
        if (!cancelled) {
          setHasPendingVolumeReport(false)
        }
      }
    }

    loadReportState()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, comicId, volumeId])

  function sanitizeInput(text) {
    return sanitizeForbiddenInputChars(text)
  }

  const canReportVolume = Boolean(authUser?.uid) && currentUserRole === 'usuario'
  const canDeleteVolume = currentUserRole === 'admin'

  function resetReportForm() {
    if (reportScreenshotPreview) {
      URL.revokeObjectURL(reportScreenshotPreview)
    }

    setReportReason(REPORT_REASON_OPTIONS_FOR_CONTENT[0])
    setReportDescription('')
    setReportScreenshotFile(null)
    setReportScreenshotPreview('')
    setReportError('')
  }

  function openReportModal() {
    resetReportForm()
    setIsReportModalOpen(true)
  }

  function closeReportModal(forceClose = false) {
    if (isSubmittingReport && !forceClose) {
      return
    }

    resetReportForm()
    setIsReportModalOpen(false)
  }

  function handleReportScreenshotChange(event) {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) {
      if (reportScreenshotPreview) {
        URL.revokeObjectURL(reportScreenshotPreview)
      }

      setReportScreenshotFile(null)
      setReportScreenshotPreview('')
      setReportError('')
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setReportError('La captura debe ser .jpg, .jpeg, .png o .webp.')
      return
    }

    if (selectedFile.size > MAX_COVER_SIZE_BYTES) {
      setReportError('La captura es demasiado pesada. Usa una imagen menor a 500 KB.')
      return
    }

    if (reportScreenshotPreview) {
      URL.revokeObjectURL(reportScreenshotPreview)
    }

    setReportError('')
    setReportScreenshotFile(selectedFile)
    setReportScreenshotPreview(URL.createObjectURL(selectedFile))
  }

  async function handleSubmitVolumeReport(event) {
    event.preventDefault()

    if (!authUser?.uid || !volumeId) {
      setReportError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    if (hasPendingVolumeReport) {
      setReportError('Ya tienes un reporte pendiente para este tomo.')
      return
    }

    const sanitizedDescription = sanitizeInput(reportDescription)

    if (!reportReason) {
      setReportError('Debes seleccionar un motivo.')
      return
    }

    if (!sanitizedDescription) {
      setReportError('La descripción del reporte es obligatoria.')
      return
    }

    try {
      setIsSubmittingReport(true)
      setReportError('')

      let screenshotPayload = null

      if (reportScreenshotFile) {
        const screenshotDataUrl = await readFileAsDataUrl(reportScreenshotFile)
        screenshotPayload = {
          dataUrl: screenshotDataUrl,
          fileName: reportScreenshotFile.name,
          contentType: reportScreenshotFile.type,
          sizeBytes: reportScreenshotFile.size,
          source: 'firestore-inline',
        }
      }

      await createReport({
        usuarioIdReporta: authUser.uid,
        objetoReportadoId: volumeId,
        comicId,
        nombreObjetoReportado: 'tomo',
        motivo: reportReason,
        descripcion: sanitizedDescription,
        capturaPantalla: screenshotPayload,
      })

      setHasPendingVolumeReport(true)
      setReportNotice('Reporte enviado correctamente. Gracias por ayudarnos a mejorar Comiku.')
      closeReportModal(true)
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : 'No fue posible enviar el reporte.',
      )
    } finally {
      setIsSubmittingReport(false)
    }
  }

  const openDeleteVolumeModal = () => {
    setDeleteError('')
    setDeleteModalOpen(true)
  }

  const closeDeleteVolumeModal = () => {
    if (deletingVolume) {
      return
    }

    setDeleteModalOpen(false)
  }

  const handleDeleteVolume = async () => {
    if (!authUser?.getIdToken || !comicId || !volumeId) {
      setDeleteError('No fue posible iniciar la eliminación.')
      return
    }

    try {
      setDeletingVolume(true)
      setDeleteError('')
      const idToken = await authUser.getIdToken()
      await deleteVolumeByAdmin({ idToken, comicId, volumeId })

      setDeleteModalOpen(false)

      if (onDeleteVolume) {
        onDeleteVolume({ comicId, volumeId })
        return
      }

      setError('Tomo eliminado correctamente.')
      setVolume(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No fue posible eliminar el tomo.')
    } finally {
      setDeletingVolume(false)
    }
  }

  const handleToggleLibrary = async () => {
    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    try {
      setIsUpdatingLibrary(true)
      setListError('')
      setListNotice('')

      const nextMembership = await toggleVolumeInLibrary({
        uid: authUser.uid,
        comicId,
        volumeId,
      })

      setMembership(nextMembership)

      if (!nextMembership.inLibrary) {
        setLibraryData({
          inLibrary: false,
          leido: false,
          fechaLectura: [],
          readingEntries: [],
        })
      }

      setListNotice(
        nextMembership.inLibrary
          ? 'El tomo fue agregado a tu biblioteca.'
          : 'El tomo fue removido de tu biblioteca.',
      )
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible actualizar tu biblioteca.',
      )
    } finally {
      setIsUpdatingLibrary(false)
    }
  }

  const handleToggleWishlist = async () => {
    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    try {
      setIsUpdatingWishlist(true)
      setListError('')
      setListNotice('')

      const nextMembership = await toggleVolumeInWishlist({
        uid: authUser.uid,
        comicId,
        volumeId,
      })

      setMembership(nextMembership)

      setListNotice(
        nextMembership.inWishlist
          ? 'El tomo fue agregado a tu lista de deseados.'
          : 'El tomo fue removido de tu lista de deseados.',
      )
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible actualizar tu lista de deseados.',
      )
    } finally {
      setIsUpdatingWishlist(false)
    }
  }

  const handleAddReading = async (event) => {
    event.preventDefault()

    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    if (!membership.inLibrary) {
      setListError('Primero debes agregar el tomo a tu biblioteca.')
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(readingDate)) {
      setListError('Debes seleccionar una fecha válida.')
      return
    }

    const [year, month, day] = readingDate.split('-').map(Number)
    const readingDateValue = new Date(year, month - 1, day)

    //Valido que la fecha no sea futura.
    const today = new Date()
    today.setHours(0, 0, 0, 0) //Comparo solo fechas, sin horas.

    if (readingDateValue > today) {
      setListError('No puedes guardar una lectura con una fecha futura.')
      return
    }

    try {
      setIsAddingReading(true)
      setListError('')
      setListNotice('')

      const nextLibraryData = await addVolumeReading({
        uid: authUser.uid,
        comicId,
        volumeId,
        readingDate: readingDateValue,
      })

      setLibraryData(nextLibraryData)
      setMembership((current) => ({
        ...current,
        inLibrary: true,
      }))
      setReadingDate('')
      setListNotice('La lectura fue guardada correctamente.')
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible guardar la lectura.',
      )
    } finally {
      setIsAddingReading(false)
    }
  }

  const handleDeleteReading = async (readingEntry) => {
    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    setReadingToDelete(readingEntry)
  }

  const confirmDeleteReading = async () => {
    if (!readingToDelete || !authUser?.uid || !comicId || !volumeId) {
      setReadingToDelete(null)
      return
    }

    try {
      setIsAddingReading(true)
      setListError('')
      setListNotice('')

      const nextLibraryData = await deleteVolumeReading({
        uid: authUser.uid,
        comicId,
        volumeId,
        storageIndex: readingToDelete.storageIndex,
      })

      setLibraryData(nextLibraryData)
      setListNotice('La lectura fue eliminada correctamente.')
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible eliminar la lectura.',
      )
    } finally {
      setIsAddingReading(false)
      setReadingToDelete(null)
    }
  }

  const isMutatingList =
    isUpdatingLibrary || isUpdatingWishlist || isAddingReading || listLoading

  if (loading) {
    return (
      <main className="app-shell volume-detail-page loading">
        <section className="app-card loading-card">
          <p className="status-message">Cargando informacion del tomo...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell volume-detail-page">
      <section className="app-card volume-detail-card">
        {error ? <p className="form-message error">{error}</p> : null}
        {listError ? <p className="form-message error">{listError}</p> : null}
        {listNotice ? <p className="form-message success">{listNotice}</p> : null}
        {reportNotice ? <p className="form-message success">{reportNotice}</p> : null}

        {!volume || !comic ? null : (
          <div className="volume-detail-grid">
            <section>
              <h1>
                {volume.numeroTomo !== null
                  ? `${comic.nombre} - Tomo ${volume.numeroTomo}`
                  : `${comic.nombre} - Tomo único`}
              </h1>
              <div className="volume-detail-meta">
                <p>
                  <strong>ISBN:</strong> {volume.isbn || 'No definido'}
                </p>
                <p>
                  <strong>Publicación:</strong>{' '}
                  {formatPublicationDate(volume.fechaPublicacion)}
                </p>
                {membership.inLibrary ? (
                  <p>
                    <strong>Leído:</strong> {libraryData.leido ? 'Sí' : 'No'}
                  </p>
                ) : null}
              </div>

              {canDeleteVolume ? (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (onEditVolume) onEditVolume({ comicId, volumeId })
                    }}
                  >
                    Modificar tomo
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={openDeleteVolumeModal}
                    style={{ marginLeft: 8 }}
                  >
                    Eliminar tomo
                  </button>
                </div>
              ) : null}
              <div className="volume-list-actions">
                <button
                  className={`volume-list-button ${membership.inLibrary ? 'active-library' : ''}`}
                  type="button"
                  onClick={handleToggleLibrary}
                  disabled={isMutatingList}
                >
                  {membership.inLibrary ? 'En biblioteca ✓' : '+ Agregar a biblioteca'}
                </button>

                <button
                  className={`volume-list-button ${membership.inWishlist ? 'active-wishlist' : ''}`}
                  type="button"
                  onClick={handleToggleWishlist}
                  disabled={isMutatingList}
                >
                  {membership.inWishlist ? 'En deseados ✓' : '+ Agregar a deseados'}
                </button>
              </div>

              {canReportVolume ? (
                <section className="report-content-panel">
                  <h2 style={{color: 'black'}}>Reportes</h2>
                  {hasPendingVolumeReport ? (
                    <p className="helper-text">
                      Ya tienes un reporte pendiente para este tomo. Podrás volver a reportarlo cuando se resuelva.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={openReportModal}
                    >
                      Reportar tomo
                    </button>
                  )}
                </section>
              ) : null}

              {membership.inLibrary ? (
                <section className="volume-reading-panel">
                  <h2>Agregar lectura</h2>
                  <form className="volume-reading-form" onSubmit={handleAddReading}>
                    <label htmlFor="reading-date">Fecha de lectura</label>
                    <div className="volume-reading-form-row">
                      <input
                        id="reading-date"
                        type="date"
                        value={readingDate}
                        onChange={(event) => setReadingDate(event.target.value)}
                        disabled={isMutatingList}
                      />
                      <button
                        className="volume-reading-button"
                        type="submit"
                        disabled={isMutatingList || !readingDate}
                      >
                        Guardar lectura
                      </button>
                    </div>
                  </form>

                  <div className="volume-reading-history">
                    <h3>Lecturas guardadas</h3>
                    {sortedReadings.length === 0 ? (
                      <p className="helper-text">
                        Todavía no registraste lecturas para este tomo.
                      </p>
                    ) : (
                      <ul className="volume-reading-list">
                        {sortedReadings.map((item) => (
                          <li key={item.id} className="volume-reading-item">
                            <span>{formatReadingDate(item.date)}</span>
                            <button
                              type="button"
                              className="volume-reading-delete-button"
                              onClick={() => handleDeleteReading(item)}
                              disabled={isMutatingList}
                              aria-label={`Eliminar lectura del ${formatReadingDate(item.date)}`}
                            >
                              Eliminar lectura
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ) : (
                <p className="helper-text volume-reading-helper">
                  Agrega este tomo a tu biblioteca para registrar lecturas.
                </p>
              )}
            </section>

            <section className="volume-detail-cover-area">
              {volume.portada?.dataUrl ? (
                <img
                  className="volume-detail-cover"
                  src={volume.portada.dataUrl}
                  alt={`Portada del ${volume.numeroTomo !== null ? `tomo ${volume.numeroTomo}` : 'tomo único'}`}
                />
              ) : (
                <div className="volume-detail-cover-placeholder">Sin portada</div>
              )}
            </section>
          </div>
        )}

        {volume && comic ? (
          <NearbyBookstores
            authUser={authUser}
            volumeTitle={
              volume.numeroTomo !== null
                ? `${comic.nombre}, tomo ${volume.numeroTomo}`
                : `${comic.nombre}, tomo único`
            }
          />
        ) : null}

        {deleteModalOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={closeDeleteVolumeModal}>
            <section
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-volume-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="modal-header">
                <p className="attention">ATENCION</p>
                <h3 id="delete-volume-modal-title">Eliminar tomo</h3>
              </header>

              <div className="modal-body">
                <p>
                Esta acción eliminará el tomo y todas sus referencias asociadas.
                </p>
              </div>
              {deleteError ? <p className="form-message error">{deleteError}</p> : null}

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeDeleteVolumeModal}
                  disabled={deletingVolume}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={handleDeleteVolume}
                  disabled={deletingVolume}
                >
                  {deletingVolume ? 'Eliminando...' : 'Eliminar tomo'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isReportModalOpen ? (
          <div className="report-modal-backdrop" role="presentation">
            <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-volume-modal-title">
              <h2 id="report-volume-modal-title">Reportar tomo</h2>

              {reportError ? <p className="form-message error">{reportError}</p> : null}

              <form className="report-form" onSubmit={handleSubmitVolumeReport}>
                <label htmlFor="volume-report-reason">Motivo</label>
                <select
                  id="volume-report-reason"
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  disabled={isSubmittingReport}
                >
                  {REPORT_REASON_OPTIONS_FOR_CONTENT.map((reasonOption) => (
                    <option key={reasonOption} value={reasonOption}>
                      {reasonOption}
                    </option>
                  ))}
                </select>

                <label htmlFor="volume-report-description">Descripción</label>
                <textarea
                  id="volume-report-description"
                  value={reportDescription}
                  onChange={(event) => setReportDescription(sanitizeForbiddenInputChars(event.target.value))}
                  rows={4}
                  placeholder="Describe brevemente el problema."
                  disabled={isSubmittingReport}
                />

                <label htmlFor="volume-report-screenshot">Captura de pantalla (opcional)</label>
                <FileInput
                  id="volume-report-screenshot"
                  accept=".jpg,.jpeg,.png,.webp"
                  onFileChange={(file) => handleReportScreenshotChange({ target: { files: file ? [file] : [] } })}
                  disabled={isSubmittingReport}
                  initialFileName={reportScreenshotFile?.name}
                />

                {reportScreenshotPreview ? (
                  <div className="report-screenshot-preview-card">
                    <img
                      src={reportScreenshotPreview}
                      alt="Vista previa de la captura para el reporte"
                      className="report-screenshot-preview-image"
                    />
                  </div>
                ) : null}

                <div className="report-modal-actions">
                  <Button variant="secondary" className="report-modal-button secondary" onClick={closeReportModal} disabled={isSubmittingReport}>Cancelar</Button>
                  <Button variant="primary" className="report-modal-button" type="submit" disabled={isSubmittingReport}>{isSubmittingReport ? 'Enviando reporte...' : 'Enviar reporte'}</Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {readingToDelete ? (
          <div className="reading-modal-backdrop" role="presentation">
            <div
              className="reading-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reading-modal-title"
            >
              <p className="eyebrow">Confirmar eliminación</p>
              <h2 id="reading-modal-title">Eliminar lectura</h2>
              <p className="reading-modal-text">
                Vas a borrar la lectura del {formatReadingDate(readingToDelete.date)}.
                Esta acción no se puede deshacer.
              </p>

              <div className="reading-modal-actions">
                <Button
                  variant="secondary"
                  className="reading-modal-button secondary"
                  onClick={() => setReadingToDelete(null)}
                  disabled={isMutatingList}
                  type="button"
                >
                  Cancelar
                </Button>

                <Button
                  variant="danger"
                  className="reading-modal-button destructive"
                  onClick={confirmDeleteReading}
                  disabled={isMutatingList}
                  type="button"
                >
                  Eliminar lectura
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default VolumeDetailPage