import { useEffect, useRef, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import {
  getComicById,
  getComicVolumes,
  getComicReviews,
  addReview,
  updateReview,
  deleteReview,
  getUserReview,
} from '../firebase/comics'
import { getUserProfile } from '../firebase/user'
import { getUserLibraryItems } from '../firebase/volumeLists'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import '../styles/ComicDetailPage.css'

function ComicDetailPage({ authUser, comicId, onOpenVolume }) {
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

  const [userReview, setUserReview] = useState(null)
  const [userRating, setUserRating] = useState(0)
  const [userComment, setUserComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const volumeGridRef = useRef(null)
  const volumeGridLeftRef = useRef(null)
  const volumeGridRightRef = useRef(null)

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
          } catch {}
        } else {
          setUserLibraryVolumes([])
          setUserReview(null)
          setUserRating(0)
          setUserComment('')
        }
        // load first page of reviews
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
        }
      }
    }

    loadComicDetail()

    return () => {
      cancelled = true
    }
  }, [comicId, authUser?.uid])

  useEffect(() => {
    // precargar perfiles de reseñas visibles
    const missing = Array.from(new Set(reviews.map((r) => r.usuarioId))).filter(
      (uid) => uid && !userProfiles[uid],
    )

    if (missing.length === 0) return

    missing.forEach((uid) => {
      ensureUserProfile(uid)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews])

  const scrollVolumes = (direction, ref) => {
    if (!ref?.current) return

    const scrollAmount = 220
    ref.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  // ---- reseñas helpers y manejadores ----
  const [userProfiles, setUserProfiles] = useState({})

  function sanitizeInput(text) {
    if (!text) return ''
    return String(text).replace(/[@#\$\^&\*\{\}\[\]<>]/g, '')
  }

  async function ensureUserProfile(uid) {
    if (!uid) return null
    if (userProfiles[uid]) return userProfiles[uid]
    try {
      const profile = await getUserProfile(uid)
      setUserProfiles((s) => ({ ...s, [uid]: profile }))
      return profile
    } catch {
      return null
    }
  }

  function formatDate(date) {
    if (!date) return ''
    try {
      return new Date(date).toLocaleString()
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
      // Recargar datos del cómic para actualizar promedio y cantidad de calificaciones
      const updatedComicData = await getComicById(comicId)
      if (updatedComicData) {
        setComic(updatedComicData)
      }
    } catch {
      // ignore
    } finally {
      setReviewsLoading(false)
    }
  }

  async function handleSubmitReview(e) {
    e && e.preventDefault()
    if (!authUser?.uid) return
    if (!userRating || userRating < 1) {
      alert('Debes seleccionar una calificación entre 1 y 5.')
      return
    }

    const cleanComment = sanitizeInput(userComment)

    try {
      setSubmittingReview(true)

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

  async function handleDeleteReview() {
    if (!authUser?.uid || !userReview) return
    if (!confirm('¿Eliminar reseña?')) return
    try {
      setSubmittingReview(true)
      await deleteReview({ comicId, reviewId: userReview.id })
      await refreshReviewsAndUserReview()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No fue posible eliminar la reseña.')
    } finally {
      setSubmittingReview(false)
    }
  }
  // ---- fin reseñas ----

  const hasComicInLibrary = userLibraryVolumes.length > 0

  const libraryVolumeIds = new Set(userLibraryVolumes.map((v) => v.id))
  const missingVolumes = volumes.filter((volume) => !libraryVolumeIds.has(volume.id))
  const ownedVolumes = volumes.filter((volume) => libraryVolumeIds.has(volume.id))

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando detalle del comic...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card comic-detail-card">
        {error ? <p className="form-message error">{error}</p> : null}

        {!comic ? null : (
          <>
            <header className="comic-detail-header">
              <p className="eyebrow">Comiku / Detalle comic</p>
              <h1>{comic.nombre}</h1>
              <p className="lead">{comic.descripcion || 'Sin descripción.'}</p>
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

            <section className="comic-detail-volumes">
              {volumes.length === 0 ? (
                <>
                  <h2>Tomos y portadas</h2>
                  <p className="helper-text">Este comic todavía no tiene tomos cargados.</p>
                </>
              ) : hasComicInLibrary ? (
                <>
                  {missingVolumes.length > 0 && (
                    <div>
                      <h2>Me faltan</h2>
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
                    <div>
                      <h2>Tengo</h2>
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
                          onClick={() => setUserRating(n)}
                          aria-label={`Puntuar ${n} estrellas`}
                        >
                          {userRating >= n ? '★' : '☆'}
                        </button>
                      ))}
                    </div>

                    <div>
                      <textarea
                        value={userComment}
                        onChange={(e) => setUserComment(e.target.value)}
                        placeholder="Deja tu comentario (opcional)"
                        rows={3}
                      />
                    </div>

                    <div className="review-actions">
                      <button type="submit" disabled={submittingReview}>
                        {userReview ? 'Actualizar reseña' : 'Publicar reseña'}
                      </button>
                      {userReview ? (
                        <button type="button" onClick={handleDeleteReview} disabled={submittingReview}>
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </form>
                )}
              </div>

              <div className="other-reviews">
                <h3>Opiniones</h3>

                {reviewsLoading ? (
                  <p>Cargando opiniones...</p>
                ) : reviews.length === 0 ? (
                  <p className="helper-text">Aun no hay opiniones sobre este cómic.</p>
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
                              <strong>{profile?.nombre || profile?.nick || 'Usuario'}</strong>
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
      </section>
    </main>
  )
}

export default ComicDetailPage