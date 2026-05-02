import { useEffect, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
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
} from '../firebase/thematicLists'
import { getComicById, getComicVolumeById } from '../firebase/comics'
import { getUserProfile } from '../firebase/user'
import '../styles/ThematicListsShared.css'
import '../styles/ThematicListDetailPage.css'

function ThematicListDetailPage({ authUser, listId, onBack, onOpenVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [list, setList] = useState(null)
  const [volumes, setVolumes] = useState([])
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [commentAuthors, setCommentAuthors] = useState({})
  const [volumeCards, setVolumeCards] = useState([])
  const [processingLike, setProcessingLike] = useState(false)
  const [processingSave, setProcessingSave] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState('')

  const loadCommentsWithAuthors = async (currentListId) => {
    const comms = await getListComments({ listId: currentListId })
    const uniqueUserIds = [...new Set(comms.map((comment) => comment.userId).filter(Boolean))]

    const profiles = await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const profile = await getUserProfile(userId)

          return [
            userId,
            profile?.nick?.trim() || profile?.nombre?.trim() || userId,
          ]
        } catch {
          return [userId, userId]
        }
      }),
    )

    setComments(comms)
    setCommentAuthors(Object.fromEntries(profiles))

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

        if (!cancelled) setList(data)

        const vols = await getListVolumes({ listId })

        const nextVolumeCards = await Promise.all(
          vols.map(async (volumeEntry) => {
            try {
              const [comic, volumeData] = await Promise.all([
                getComicById(volumeEntry.comicId),
                getComicVolumeById({
                  comicId: volumeEntry.comicId,
                  volumeId: volumeEntry.volumeId,
                }),
              ])

              return {
                ...volumeEntry,
                comicName: comic?.nombre || '',
                volumeData,
              }
            } catch {
              return {
                ...volumeEntry,
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
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [listId, authUser?.uid])

  const handleToggleLike = async () => {
    if (!authUser?.uid) {
      setError('Debes iniciar sesión para dar like.')
      return
    }

    try {
      setProcessingLike(true)
      const result = await toggleLikeForList({ listId, userId: authUser.uid })
      setLiked(result.liked)

      // actualizar contador en UI
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
      await addCommentToList({ listId, userId: authUser.uid, comentario: commentText.trim() })
      const comms = await loadCommentsWithAuthors(listId)
      setCommentText('')
      setList((prev) => ({ ...prev, cantidadComentarios: comms.length }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar comentario')
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
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Comiku / Listas temáticas</p>
            <h1>{list.nombre}</h1>
            <p className="lead">{list.descripcion || 'Sin descripción'}</p>
          </div>

          <div className="hero-actions">
            <button className="back-button" onClick={onBack} type="button">Volver</button>
          </div>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="thematic-list-detail-meta">
          <button className="primary-button" onClick={handleToggleLike} disabled={processingLike} type="button">
            {liked ? '💙' : '🤍'} {list.cantidadLikes} 
          </button>

          <button className="secondary-button" onClick={() => {}} type="button">
            🗨️ {list.cantidadComentarios}
          </button>

          <button className="secondary-button" onClick={handleToggleSave} disabled={processingSave || list.userId === authUser?.uid} type="button">
            {processingSave ? '...' : saved ? 'Guardada' : 'Guardar'}
          </button>
        </div>

        <div className="section-divider">
          <h2>Tomos ({volumes.length})</h2>
        </div>

        {volumeCards.length === 0 ? (
          <p className="helper-text">No hay tomos en esta lista.</p>
        ) : (
          <div className="selected-volumes-grid">
            {volumeCards.map((v) => (
              <div key={v.volumeId} className="selected-volume-card">
                <VolumeCoverCard
                  volume={v.volumeData || {}}
                  comicName={v.comicName}
                  onOpen={() => onOpenVolume({ comicId: v.comicId, volumeId: v.volumeId })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="section-divider">
          <h2>Comentarios ({comments.length})</h2>
        </div>

        <div className="comments-section">
          {comments.length === 0 ? <p className="helper-text">Sé el primero en comentar.</p> : (
            <ul>
              {comments.map((c) => (
                <li key={c.id} className="comment-item">
                  <div className="comment-meta">
                    <strong>{commentAuthors[c.userId] || c.userId}</strong>
                    <span>{c.fechaComentario ? new Date(c.fechaComentario.seconds * 1000).toLocaleString() : ''}</span>
                  </div>
                  <p>{c.comentario}</p>
                  {authUser?.uid === c.userId ? (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDeleteComment(c.id)}
                      disabled={deletingCommentId === c.id}
                    >
                      {deletingCommentId === c.id ? 'Eliminando...' : 'Eliminar comentario'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="comment-form">
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Deja un comentario..." rows={3} />
            <div className="form-actions">
              <button className="primary-button" onClick={handleAddComment} type="button">Comentar</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ThematicListDetailPage
