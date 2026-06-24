import { useEffect, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import Button from '../Components/Button'
import {
  getThematicListById,
  getListVolumes,
  getListComments,
  addCommentToList,
  deleteCommentFromList,
  toggleLikeForList,
  getUserLikeStatus,
  getUserSavedListStatus,
  toggleSaveListForUser,
  deleteThematicListByAdmin,
} from '../firebase/thematicLists'
import { getComicById, getComicVolumeById } from '../firebase/comics'
import { getUserProfile, isUserBlocked } from '../firebase/user'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import '../styles/Modal.css'
import '../styles/ThematicListsShared.css'
import '../styles/ThematicListDetailPage.css'

function formatCommentDateTime(value) {
  if (!value) return ''

  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function ThematicListDetailPage({ authUser, listId, onBack, onOpenVolume, onDeleteList, onOpenProfile, onPageReady }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [list, setList] = useState(null)
  const [volumes, setVolumes] = useState([])
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [commentProfiles, setCommentProfiles] = useState({})
  const [volumeCards, setVolumeCards] = useState([])
  const [processingLike, setProcessingLike] = useState(false)
  const [processingSave, setProcessingSave] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletingList, setDeletingList] = useState(false)
  const [processingComment, setProcessingComment] = useState(false)
  const [creatorNick, setCreatorNick] = useState('')

  const loadCommentsWithAuthors = async (currentListId) => {
    const comms = await getListComments({ listId: currentListId })
    const uniqueUserIds = [...new Set(comms.map((comment) => comment.userId).filter(Boolean))]

    const profiles = await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const profile = await getUserProfile(userId)

          return [
            userId,
            profile,
          ]
        } catch {
          return [
            userId,
            {
              uid: userId,
              nick: userId,
              nombre: userId,
              fotoPerfil: defaultProfilePicture,
            },
          ]
        }
      }),
    )

    setComments(comms)
    setCommentProfiles(Object.fromEntries(profiles))

    return comms
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        const data = await getThematicListById({ listId })

        if (!data) {
          if (!cancelled) setError('Lista no encontrada.')
          return
        }

        if (authUser?.uid && data.userId) {
          const hasBlockedCurrentUser = await isUserBlocked(authUser.uid, data.userId)

          if (hasBlockedCurrentUser) {
            if (!cancelled) {
              setList(null)
              setError('No puedes ver esta lista porque su autor te bloqueó.')
            }

            return
          }
        }

        if (data.userId) {
          try {
            const creatorProfile = await getUserProfile(data.userId)
            if (!cancelled) {
              setCreatorNick(creatorProfile?.nick?.trim() || creatorProfile?.nombre?.trim() || data.userId)
            }
          } catch {
            if (!cancelled) {
              setCreatorNick(data.userId)
            }
          }
        }

        if (!cancelled) setList(data)

        const vols = await getListVolumes({ listId })

        const nextVolumeCards = await Promise.all(
          vols.map(async (volumeEntry) => {
            try {
              const [comic, volumeData] = await Promise.all([
                getComicById(volumeEntry.comicId),
                getComicVolumeById({
                  comicId: volumeEntry.comicId,
                  volumeId: volumeEntry.tomoId,
                }),
              ])

              return {
                ...volumeEntry,
                volumeId: volumeEntry.tomoId,
                comicName: comic?.nombre || '',
                volumeData,
              }
            } catch {
              return {
                ...volumeEntry,
                volumeId: volumeEntry.tomoId,
                comicName: '',
                volumeData: null,
              }
            }
          }),
        )

        if (!cancelled) {
          setVolumes(vols)
          setVolumeCards(nextVolumeCards)
        }

        const comms = await loadCommentsWithAuthors(listId)

        if (!cancelled) setComments(comms)

        if (authUser?.uid) {
          const isLiked = await getUserLikeStatus({ listId, userId: authUser.uid })
          if (!cancelled) setLiked(isLiked)

          if (data.userId !== authUser.uid) {
            const isSaved = await getUserSavedListStatus({ listId, userId: authUser.uid })
            if (!cancelled) setSaved(isSaved)
          } else if (!cancelled) {
            setSaved(false)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar la lista.')
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [listId, authUser?.uid])

  useEffect(() => {
    let cancelled = false

    async function loadRole() {
      if (!authUser?.uid) {
        if (!cancelled) {
          setCurrentUserRole('')
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
    }

    loadRole()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  const handleToggleLike = async () => {
    if (!authUser?.uid) {
      setError('Debes iniciar sesión para dar like.')
      return
    }

    try {
      setProcessingLike(true)
      const result = await toggleLikeForList({ listId, userId: authUser.uid })
      setLiked(result.liked)

      setList((prev) => ({
        ...prev,
        cantidadLikes: prev ? (prev.cantidadLikes + (result.liked ? 1 : -1)) : 0,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al togglear like')
    } finally {
      setProcessingLike(false)
    }
  }

  const handleToggleSave = async () => {
    if (!authUser?.uid) {
      setError('Debes iniciar sesión para guardar listas.')
      return
    }

    if (list?.userId === authUser.uid) {
      setError('No puedes guardar tus propias listas.')
      return
    }

    try {
      setProcessingSave(true)
      const res = await toggleSaveListForUser({ listId, userId: authUser.uid })
      setSaved(res.saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la lista')
    } finally {
      setProcessingSave(false)
    }
  }

  const handleAddComment = async () => {
    if (!authUser?.uid) {
      setError('Debes iniciar sesión para comentar.')
      return
    }

    if (!commentText.trim()) return

    try {
      if (processingComment) return
      setProcessingComment(true)
      await addCommentToList({ listId, userId: authUser.uid, comentario: commentText.trim() })
      const comms = await loadCommentsWithAuthors(listId)
      setCommentText('')
      setList((prev) => ({ ...prev, cantidadComentarios: comms.length }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar comentario')
    }
    finally {
      setProcessingComment(false)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!authUser?.uid) {
      setError('Debes iniciar sesión para eliminar comentarios.')
      return
    }

    try {
      setDeletingCommentId(commentId)
      await deleteCommentFromList({ listId, commentId, userId: authUser.uid })
      const comms = await loadCommentsWithAuthors(listId)
      setList((prev) => ({ ...prev, cantidadComentarios: comms.length }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar comentario')
    } finally {
      setDeletingCommentId('')
    }
  }

  const canDeleteList = currentUserRole === 'admin'

  const openDeleteListModal = () => {
    setDeleteError('')
    setDeleteModalOpen(true)
  }

  const closeDeleteListModal = () => {
    if (deletingList) {
      return
    }

    setDeleteModalOpen(false)
  }

  const handleDeleteList = async () => {
    if (!authUser?.getIdToken || !listId) {
      setDeleteError('No fue posible iniciar la eliminación.')
      return
    }

    try {
      setDeletingList(true)
      setDeleteError('')
      const idToken = await authUser.getIdToken()
      await deleteThematicListByAdmin({ idToken, listId })

      setDeleteModalOpen(false)

      if (onDeleteList) {
        onDeleteList(listId)
        return
      }

      setError('Lista temática eliminada correctamente.')
      setList(null)
      setVolumes([])
      setComments([])
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No fue posible eliminar la lista temática.')
    } finally {
      setDeletingList(false)
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando lista...</p>
        </section>
      </main>
    )
  }

  if (!list) {
    return (
      <main className="app-shell">
        <section className="app-card">
          <p className="form-message error">{error || 'Lista no encontrada.'}</p>
          <div className="form-actions">
            <button className="back-button" onClick={onBack} type="button">Volver</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell thematic-list-detail-page">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <h1>{list.nombre}</h1>
            <p className="lead">{list.descripcion || 'Sin descripción'}</p>
            {creatorNick && list?.userId && (
              <p className="creator-info">
                Por:{' '}
                <button
                  className="creator-profile-button"
                  onClick={() => onOpenProfile?.(list.userId)}
                  type="button"
                >
                  <strong>{creatorNick}</strong>
                </button>
              </p>
            )}
          </div>

          <div className="hero-actions">
            {canDeleteList ? (
              <Button className="danger-button" onClick={openDeleteListModal} type="button" variant="danger">
                Eliminar lista
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="thematic-list-detail-meta">
          <Button className="primary-button" onClick={handleToggleLike} disabled={processingLike} type="button" variant="primary">
            {liked ? '💙' : '🤍'} {list.cantidadLikes}
          </Button>

          <Button className="secondary-button" onClick={() => {}} type="button" variant="secondary">
            🗨️ {list.cantidadComentarios}
          </Button>

          <Button className="secondary-button" onClick={handleToggleSave} disabled={processingSave || list.userId === authUser?.uid} type="button" variant="secondary">
            {processingSave ? '...' : saved ? 'Guardada' : 'Guardar'}
          </Button>
        </div>

        {volumeCards.length === 0 ? (
          <p className="helper-text">No hay tomos en esta lista.</p>
        ) : (
          <div className="selected-volumes-grid">
            <div className="selected-volumes-grid-header">
              <h2>Tomos ({volumeCards.length})</h2>
            </div>

            {volumeCards.map((volume) => (
              <div key={volume.volumeId} className="selected-volume-card">
                <VolumeCoverCard
                  volume={volume.volumeData || {}}
                  comicName={volume.comicName}
                  onOpen={() => onOpenVolume({ comicId: volume.comicId, volumeId: volume.volumeId })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="comments-section">
          <div className="section-divider">
            <h2>Comentarios ({comments.length})</h2>
          </div>

          <div className="comment-form">
            <div className="comment-form-row">
              <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Deja un comentario..." rows={3} />
              <Button className="primary-button" onClick={handleAddComment} type="button" variant="primary" disabled={processingComment}>
                {processingComment ? 'Comentando...' : 'Comentar'}
              </Button>
            </div>
          </div>

          {comments.length === 0 ? (
            <p className="helper-text">Sé el primero en comentar.</p>
          ) : (
            <ul className="comments-list">
              {comments.map((c) => {
                const profile = commentProfiles[c.userId]

                return (
                  <li key={c.id} className="comment-card">
                    <div className="comment-user">
                      <img
                        src={profile?.fotoPerfil || defaultProfilePicture}
                        alt={profile?.nombre || 'Usuario'}
                        className="avatar"
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenProfile?.(c.userId)}
                          className="profile-link-button"
                        >
                          <strong>{profile?.nick || profile?.nombre || c.userId || 'Usuario'}</strong>
                        </button>
                        <div className="comment-meta-row">
                          <span>{formatCommentDateTime(c.fechaComentario)}</span>
                        </div>
                      </div>
                    </div>

                    {authUser?.uid === c.userId ? (
                      <Button
                        type="button"
                        className="danger-button comment-delete-button"
                        onClick={() => handleDeleteComment(c.id)}
                        disabled={deletingCommentId === c.id}
                        variant="danger"
                      >
                        {deletingCommentId === c.id ? 'Eliminando...' : 'Eliminar comentario'}
                      </Button>
                    ) : null}

                    <div className="comment-body-row">
                      <p className="comment-text">{c.comentario}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

      </section>

      {deleteModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeDeleteListModal}
        >
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-list-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <p className="attention">ATENCION</p>
              <h3 id="delete-list-modal-title">Eliminar lista temática</h3>
            </div>

            <div className="modal-body">
              <p>Esta acción eliminará la lista y todas sus referencias asociadas.</p>
              {deleteError ? <p className="form-message error">{deleteError}</p> : null}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={closeDeleteListModal}
                disabled={deletingList}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDeleteList}
                disabled={deletingList}
              >
                {deletingList ? 'Eliminando...' : 'Eliminar lista'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default ThematicListDetailPage
