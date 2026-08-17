import { useEffect, useRef, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
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
import {
  getComicById,
  getComicVolumes,
  getComicReviews,
  addReview,
  updateReview,
  deleteReview,
  getUserReview,
  deleteComicByAdmin,
} from '../firebase/comics'
import { getUserProfile } from '../firebase/user'
import { getUserLibraryItems } from '../firebase/volumeLists'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import '../styles/ComicDetailPage.css'
import FileInput from '../Components/FileInput'
import Button from '../Components/Button'
import ConfirmModal from '../Components/ConfirmModal'

function ComicDetailPage({
  authUser,
  comicId,
  onOpenVolume,
  onEditComic,
  onDeleteComic,
  onCreateVolume,
  onOpenProfile,
  globalNotice = '',
  globalError = '',
  onPageReady,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comic, setComic] = useState(null)
  const [volumes, setVolumes] = useState([])
  const [userLibraryVolumes, setUserLibraryVolumes] = useState([])
  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState('')
  const [reviewsLastId, setReviewsLastId] = useState(null)
  const [reviewsHasMore, setReviewsHasMore] = useState(false)
  const [userProfiles, setUserProfiles] = useState({})

  const [userReview, setUserReview] = useState(null)
  const [userRating, setUserRating] = useState(0)
  const [userComment, setUserComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewFormError, setReviewFormError] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS_FOR_CONTENT[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportScreenshotFile, setReportScreenshotFile] = useState(null)
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState('')
  const [reportError, setReportError] = useState('')
  const [reportNotice, setReportNotice] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [hasPendingComicReport, setHasPendingComicReport] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletingComic, setDeletingComic] = useState(false)
  const [deleteReviewModalOpen, setDeleteReviewModalOpen] = useState(false)
  const [deleteReviewError, setDeleteReviewError] = useState('')
  const [deletingReview, setDeletingReview] = useState(false)
  const volumeGridRef = useRef(null)
  const volumeGridLeftRef = useRef(null)
  const volumeGridRightRef = useRef(null)

  useEffect(() => {
    return () => {
      if (reportScreenshotPreview) {
        URL.revokeObjectURL(reportScreenshotPreview)
      }
    }
  }, [reportScreenshotPreview])

  useEffect(() => {
    let cancelled = false

    async function loadComicDetail() {
      if (!comicId) {
        setError('No se encontró el comic solicitado.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const [comicData, volumeData] = await Promise.all([
          getComicById(comicId),
          getComicVolumes(comicId),
        ])

        if (cancelled) {
          return
        }

        if (!comicData) {
          setError('El comic solicitado no existe o fue eliminado.')
          setComic(null)
          setVolumes([])
          setUserLibraryVolumes([])
          return
        }

        setComic(comicData)
        setVolumes(volumeData)

        if (authUser?.uid) {
          try {
            const currentProfile = await getUserProfile(authUser.uid)

            if (!cancelled) {
              setCurrentUserRole(currentProfile?.rol || '')
            }
          } catch {
            if (!cancelled) {
              setCurrentUserRole('')
            }
          }

          try {
            const hasPendingReport = await hasPendingObjectReport({
              usuarioIdReporta: authUser.uid,
              objetoReportadoId: comicId,
              nombreObjetoReportado: 'comic',
              comicId,
            })

            if (!cancelled) {
              setHasPendingComicReport(hasPendingReport)
            }
          } catch {
            if (!cancelled) {
              setHasPendingComicReport(false)
            }
          }

          try {
            const libraryItems = await getUserLibraryItems({ uid: authUser.uid })
            const comicInLibrary = libraryItems.find((item) => item.comicId === comicId)
            setUserLibraryVolumes(comicInLibrary?.volumes ?? [])
          } catch {
            setUserLibraryVolumes([])
          }
          try {
            const myReview = await getUserReview(comicId, authUser.uid)
            if (myReview) {
              setUserReview(myReview)
              setUserRating(myReview.calificacion ?? 0)
              setUserComment(myReview.descripcion || '')
            } else {
              setUserReview(null)
              setUserRating(0)
              setUserComment('')
            }
          } catch (error) {
            void error
          }
        } else {
          setUserLibraryVolumes([])
          setUserReview(null)
          setUserRating(0)
          setUserComment('')
          setCurrentUserRole('')
          setHasPendingComicReport(false)
        }

        try {
          setReviewsLoading(true)
          const { reviews: firstReviews, lastId, hasMore } = await getComicReviews(comicId, 10)
          setReviews(firstReviews)
          setReviewsLastId(lastId)
          setReviewsHasMore(hasMore)
        } catch (err) {
          setReviewsError(err instanceof Error ? err.message : 'No fue posible cargar reseñas.')
        } finally {
          setReviewsLoading(false)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el detalle del comic.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    loadComicDetail()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, comicId, onPageReady])

  useEffect(() => {
    const missing = Array.from(new Set(reviews.map((r) => r.usuarioId))).filter(
      (uid) => uid && !userProfiles[uid],
    )

    if (missing.length === 0) return

    missing.forEach((uid) => {
      void getUserProfile(uid)
        .then((profile) => {
          setUserProfiles((currentProfiles) => ({ ...currentProfiles, [uid]: profile }))
        })
        .catch((error) => {
          console.error(`No se pudo cargar el perfil ${uid}:`, error)
        })
    })
  }, [reviews, userProfiles])

  const scrollVolumes = (direction, ref) => {
    if (!ref?.current) return

    const scrollAmount = 220
    ref.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const canDeleteComic = currentUserRole === 'admin'

  const openDeleteComicModal = () => {
    setDeleteError('')
    setDeleteModalOpen(true)
  }

  const closeDeleteComicModal = () => {
    if (deletingComic) {
      return
    }

    setDeleteModalOpen(false)
  }

  const handleDeleteComic = async () => {
    if (!authUser?.getIdToken || !comicId) {
      setDeleteError('No fue posible iniciar la eliminación.')
      return
    }

    try {
      setDeletingComic(true)
      setDeleteError('')
      const idToken = await authUser.getIdToken()
      await deleteComicByAdmin({ idToken, comicId })

      setDeleteModalOpen(false)

      if (onDeleteComic) {
        onDeleteComic(comicId)
        return
      }

      setError('Comic eliminado correctamente.')
      setComic(null)
      setVolumes([])
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No fue posible eliminar el comic.')
    } finally {
      setDeletingComic(false)
    }
  }


  function sanitizeInput(text) {
    return sanitizeForbiddenInputChars(text)
  }

  function formatDate(date) {
    if (!date) return ''
    try {
      const d = new Date(date)
      const datePart = d.toLocaleDateString()
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      return `${datePart} ${hours}:${minutes}`
    } catch {
      return ''
    }
  }

  async function loadMoreReviews() {
    if (!comicId || !reviewsHasMore) return
    try {
      setReviewsLoading(true)
      const { reviews: next, lastId, hasMore } = await getComicReviews(comicId, 10, reviewsLastId)
      setReviews((r) => r.concat(next))
      setReviewsLastId(lastId)
      setReviewsHasMore(hasMore)
    } catch (err) {
      setReviewsError(err instanceof Error ? err.message : 'No fue posible cargar más reseñas.')
    } finally {
      setReviewsLoading(false)
    }
  }

  async function refreshReviewsAndUserReview() {
    if (!comicId) return
    try {
      setReviewsLoading(true)
      const { reviews: firstReviews, lastId, hasMore } = await getComicReviews(comicId, 10)
      setReviews(firstReviews)
      setReviewsLastId(lastId)
      setReviewsHasMore(hasMore)
      if (authUser?.uid) {
        const my = await getUserReview(comicId, authUser.uid)
        setUserReview(my)
        setUserRating(my?.calificacion ?? 0)
        setUserComment(my?.descripcion || '')
      }
      //Recargo los datos del cómic para actualizar el promedio y la cantidad de calificaciones.
      const updatedComicData = await getComicById(comicId)
      if (updatedComicData) {
        setComic(updatedComicData)
      }
    } catch (error) {
      setReviewsError(error instanceof Error ? error.message : 'No se pudieron cargar las reseñas.')
    } finally {
      setReviewsLoading(false)
    }
  }

  async function handleSubmitReview(e) {
    e && e.preventDefault()
    if (!authUser?.uid) return
    if (!userRating || userRating < 1) {
      setReviewFormError('Debes seleccionar una calificación entre 1 y 5.')
      return
    }

    const cleanComment = sanitizeInput(userComment)

    try {
      setSubmittingReview(true)
      setReviewFormError('')

      if (userReview) {
        await updateReview({
          comicId,
          reviewId: userReview.id,
          descripcion: cleanComment,
          calificacion: userRating,
        })
      } else {
        await addReview({ comicId, usuarioId: authUser.uid, descripcion: cleanComment, calificacion: userRating })
      }

      await refreshReviewsAndUserReview()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No fue posible guardar la reseña.')
    } finally {
      setSubmittingReview(false)
    }
  }

  const openDeleteReviewModal = () => {
    setDeleteReviewError('')
    setDeleteReviewModalOpen(true)
  }

  const closeDeleteReviewModal = () => {
    if (deletingReview) {
      return
    }
    setDeleteReviewModalOpen(false)
  }

  async function handleDeleteReview() {
    if (!authUser?.uid || !userReview) return
    try {
      setDeletingReview(true)
      setDeleteReviewError('')
      await deleteReview({ comicId, reviewId: userReview.id })
      await refreshReviewsAndUserReview()
      setDeleteReviewModalOpen(false)
    } catch (err) {
      setDeleteReviewError(
        err instanceof Error ? err.message : 'No fue posible eliminar la reseña.'
      )
    } finally {
      setDeletingReview(false)
    }
  }
  // ---- fin reseñas ----

  const canReportComic = Boolean(authUser?.uid) && currentUserRole === 'usuario'

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

  async function handleSubmitComicReport(event) {
    event.preventDefault()

    if (!authUser?.uid || !comicId) {
      setReportError('No hay sesión activa o faltan datos del comic.')
      return
    }

    if (hasPendingComicReport) {
      setReportError('Ya tienes un reporte pendiente para este comic.')
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
        objetoReportadoId: comicId,
        comicId,
        nombreObjetoReportado: 'comic',
        motivo: reportReason,
        descripcion: sanitizedDescription,
        capturaPantalla: screenshotPayload,
      })

      setHasPendingComicReport(true)
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

  const hasComicInLibrary = userLibraryVolumes.length > 0

  const libraryVolumeIds = new Set(userLibraryVolumes.map((v) => v.id))
  const missingVolumes = volumes.filter((volume) => !libraryVolumeIds.has(volume.id))
  const ownedVolumes = volumes.filter((volume) => libraryVolumeIds.has(volume.id))

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando informacion del comic...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card comic-detail-card">
        {globalNotice ? <p className="form-message success">{globalNotice}</p> : null}
        {globalError ? <p className="form-message error">{globalError}</p> : null}
        {error ? <p className="form-message error">{error}</p> : null}
        {reportNotice ? <p className="form-message success">{reportNotice}</p> : null}

        {!comic ? null : (
          <>
            <header className="comic-detail-header">
              <h1>{comic.nombre}</h1>
              <p className="lead">{comic.descripcion || 'Sin descripción.'}</p>
              <div className="hero-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (onCreateVolume) onCreateVolume()
                  }}
                >
                  Crear tomo
                </button>
                {canDeleteComic ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        if (onEditComic) onEditComic(comic.id)
                      }}
                    >
                      Modificar comic
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={openDeleteComicModal}
                    >
                      Eliminar comic
                    </button>
                  </>
                ) : null}
              </div>
            </header>

            <section className="comic-detail-metadata">
              <p>
                <strong>Autores:</strong>{' '}
                {comic.autores.length > 0 ? comic.autores.join(', ') : 'No definidos'}
              </p>
              <p>
                <strong>Editorial:</strong> {comic.editorial || 'No definida'}
              </p>
              <p>
                <strong>País:</strong> {comic.paisEditorial || 'No definido'}
              </p>
              <p>
                <strong>Estado:</strong> {comic.estado || 'No definido'}
              </p>
              <p>
                <strong>Géneros:</strong>{' '}
                {comic.generos.length > 0 ? comic.generos.join(', ') : 'No definidos'}
              </p>
              <p>
                <strong>Formato:</strong> {comic.formato || 'No definido'}
              </p>
            </section>

            {canReportComic ? (
              <section className="report-content-panel">
                <h2 style={{ color: 'black' }}>Reportes</h2>
                {hasPendingComicReport ? (
                  <p className="helper-text">
                    Ya tienes un reporte pendiente para este comic. Podrás volver a reportarlo cuando se resuelva.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={openReportModal}
                  >
                    Reportar comic
                  </button>
                )}
              </section>
            ) : null}

            <section className="comic-detail-volumes">
              {volumes.length === 0 ? (
                <>
                  <h2>Tomos y portadas</h2>
                  <p className="helper-text">Este comic todavía no tiene tomos cargados.</p>
                </>
              ) : hasComicInLibrary ? (
                <>
                  {missingVolumes.length > 0 && (
                    <div className="missing-volumes">
                      <h2>Tomos que me faltan</h2>
                      <div className="volume-carousel">
                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-left"
                          onClick={() => scrollVolumes('left', volumeGridLeftRef)}
                          aria-label="Desplazar tomos hacia la izquierda"
                        >
                          ←
                        </button>

                        <div className="volume-cover-grid" ref={volumeGridLeftRef}>
                          {missingVolumes.map((volume) => (
                            <VolumeCoverCard
                              key={volume.id}
                              volume={volume}
                              onOpen={onOpenVolume}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-right"
                          onClick={() => scrollVolumes('right', volumeGridLeftRef)}
                          aria-label="Desplazar tomos hacia la derecha"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}

                  {ownedVolumes.length > 0 && (
                    <div className="owned-volumes">
                      <h2>Tomos en mi biblioteca</h2>
                      <div className="volume-carousel">
                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-left"
                          onClick={() => scrollVolumes('left', volumeGridRightRef)}
                          aria-label="Desplazar tomos hacia la izquierda"
                        >
                          ←
                        </button>

                        <div className="volume-cover-grid" ref={volumeGridRightRef}>
                          {ownedVolumes.map((volume) => (
                            <VolumeCoverCard
                              key={volume.id}
                              volume={volume}
                              onOpen={onOpenVolume}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-right"
                          onClick={() => scrollVolumes('right', volumeGridRightRef)}
                          aria-label="Desplazar tomos hacia la derecha"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2>Tomos y portadas</h2>
                  <div className="volume-carousel">
                    <button
                      type="button"
                      className="volume-scroll-button volume-scroll-left"
                      onClick={() => scrollVolumes('left', volumeGridRef)}
                      aria-label="Desplazar tomos hacia la izquierda"
                    >
                      ←
                    </button>

                    <div className="volume-cover-grid" ref={volumeGridRef}>
                      {volumes.map((volume) => (
                        <VolumeCoverCard
                          key={volume.id}
                          volume={volume}
                          onOpen={onOpenVolume}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      className="volume-scroll-button volume-scroll-right"
                      onClick={() => scrollVolumes('right', volumeGridRef)}
                      aria-label="Desplazar tomos hacia la derecha"
                    >
                      →
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="comic-detail-reviews">
              <h2>Reseñas</h2>

              <div className="comic-rating-summary">
                <p>
                  <strong>Promedio:</strong>{' '}
                  {comic.promedioCalificacion ? comic.promedioCalificacion.toFixed(1) : '—'}{' '}
                  <small>({comic.cantidadCalificaciones || 0} valoraciones)</small>
                </p>
              </div>

              <div className="my-review">
                <h3>Tu reseña</h3>
                {!authUser ? (
                  <p>Inicia sesión para dejar una reseña.</p>
                ) : userLibraryVolumes.length === 0 ? (
                  <p>Necesitas tener al menos un tomo de este cómic en tu biblioteca para dejar una reseña.</p>
                ) : (
                  <form onSubmit={handleSubmitReview} className="review-form">
                    <div className="star-input">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`star-button ${userRating >= n ? 'selected' : ''}`}
                          onClick={() => {
                            setUserRating(n)
                            setReviewFormError('')
                          }}
                          aria-label={`Puntuar ${n} estrellas`}
                        >
                          {userRating >= n ? '★' : '☆'}
                        </button>
                      ))}
                    </div>

                    {reviewFormError ? <p className="form-message error">{reviewFormError}</p> : null}

                    <div>
                      <textarea
                        value={userComment}
                        onChange={(e) => setUserComment(sanitizeForbiddenInputChars(e.target.value))}
                        placeholder="Deja tu comentario (opcional)"
                        rows={3}
                      />
                    </div>

                    <div className="review-actions">
                      <button type="submit" className="primary-button" disabled={submittingReview}>
                        {userReview ? 'Actualizar reseña' : 'Publicar reseña'}
                      </button>
                      {userReview ? (
                        <button type="button" className="danger-button" onClick={openDeleteReviewModal} disabled={submittingReview}>
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </form>
                )}
              </div>

              <div className="other-reviews">
                <h3>Opiniones</h3>

                {reviewsError ? <p className="form-message error">{reviewsError}</p> : null}

                {reviewsLoading ? (
                  <p>Cargando opiniones...</p>
                ) : reviews.length === 0 ? (
                  <p className="status-message">Aun no hay opiniones sobre este cómic.</p>
                ) : (
                  <ul className="reviews-list">
                    {reviews.map((r) => {
                      const profile = userProfiles[r.usuarioId]
                      return (
                        <li key={r.id} className="review-item">
                          <div className="review-user">
                            <img
                              src={profile?.fotoPerfil || defaultProfilePicture}
                              alt={profile?.nombre || 'Usuario'}
                              className="avatar"
                            />
                            <div>
                              <button
                                type="button"
                                onClick={() => onOpenProfile?.(r.usuarioId)}
                                className="profile-link-button"
                              >
                                <strong>{profile?.nick || profile?.nombre || 'Usuario'}</strong>
                              </button>
                              <div className="review-meta">
                                <span className="review-stars">{'★'.repeat(r.calificacion || 0)}</span>
                                <span className="review-date">{formatDate(r.fecha)}</span>
                              </div>
                            </div>
                          </div>

                          <p className="review-text">{r.descripcion}</p>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {reviewsHasMore ? (
                  <div className="reviews-more">
                    <button type="button" onClick={loadMoreReviews} disabled={reviewsLoading}>
                      Ver más opiniones
                    </button>
                  </div>
                ) : reviews.length > 0 ? (
                  <p className="helper-text">No hay más opiniones.</p>
                ) : null}
              </div>
            </section>
          </>
        )}

        {deleteModalOpen ? (
          <ConfirmModal
            title="Eliminar comic"
            message={deleteError ? `${deleteError}\n\nEsta acción eliminará el comic, todos sus tomos y sus referencias asociadas.` : 'Esta acción eliminará el comic, todos sus tomos y sus referencias asociadas.'}
            confirmLabel={deletingComic ? 'Eliminando...' : 'Eliminar comic'}
            confirmDisabled={deletingComic}
            onConfirm={handleDeleteComic}
            onCancel={closeDeleteComicModal}
          />
        ) : null}

        {deleteReviewModalOpen ? (
          <ConfirmModal
            title="Eliminar reseña"
            message={deleteReviewError ? `${deleteReviewError}\n\nEsta acción eliminará permanentemente tu reseña y valoración.` : 'Esta acción eliminará permanentemente tu reseña y valoración.'}
            confirmLabel={deletingReview ? 'Eliminando...' : 'Eliminar reseña'}
            confirmDisabled={deletingReview}
            onConfirm={handleDeleteReview}
            onCancel={closeDeleteReviewModal}
          />
        ) : null}

        {isReportModalOpen ? (
          <div className="report-modal-backdrop" role="presentation">
            <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-comic-modal-title">
              <h2 id="report-comic-modal-title">Reportar comic</h2>

              {reportError ? <p className="form-message error">{reportError}</p> : null}

              <form className="report-form" onSubmit={handleSubmitComicReport}>
                <label htmlFor="comic-report-reason">Motivo</label>
                <select
                  id="comic-report-reason"
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

                <label htmlFor="comic-report-description">Descripción</label>
                <textarea
                  id="comic-report-description"
                  value={reportDescription}
                  onChange={(event) => setReportDescription(sanitizeForbiddenInputChars(event.target.value))}
                  rows={4}
                  placeholder="Describe brevemente el problema."
                  disabled={isSubmittingReport}
                />

                <label htmlFor="comic-report-screenshot">Captura de pantalla (opcional)</label>
                <FileInput
                  id="comic-report-screenshot"
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
                  <Button variant="secondary" className="report-modal-button" onClick={closeReportModal} disabled={isSubmittingReport}>Cancelar</Button>
                  <Button variant="danger" className="report-modal-button" type="submit" disabled={isSubmittingReport}>{isSubmittingReport ? 'Enviando reporte...' : 'Enviar reporte'}</Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default ComicDetailPage