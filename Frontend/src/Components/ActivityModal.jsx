import React, { useEffect, useState } from 'react'
import '../styles/ActivitiesPage.css'
import {
  toggleLikeActivity,
  getLikesCount,
  addComment,
  deleteComment,
  getCommentsPage,
  getUserLikeStatus,
} from '../firebase/activities'

function ActivityModal({
  activity,
  onClose,
  authUser,
  onOpenVolume,
  onOpenThematicList,
  onActivityStatsChange,
}) {
  const [likes, setLikes] = useState(0)
  const [liked, setLiked] = useState(false)
  const [comments, setComments] = useState([])
  const [commentsCursor, setCommentsCursor] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentToDelete, setCommentToDelete] = useState(null)
  const [commentsCount, setCommentsCount] = useState(activity.commentsCount || 0)

  useEffect(() => {
    setCommentsCount(activity.commentsCount || 0)
  }, [activity.commentsCount, activity.id])

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [count, likeStatus] = await Promise.all([
          getLikesCount(activity.id),
          getUserLikeStatus(activity.id, authUser.uid),
        ])
        if (mounted) {
          setLikes(count)
          setLiked(likeStatus)
        }
      } catch (e) {
        void e
      }

      try {
        setLoadingComments(true)
        const page = await getCommentsPage({ activityId: activity.id, pageSize: 10 })
        if (mounted) {
          setComments(page.items)
          setCommentsCursor(page.last)
        }
      } catch (e) {
        void e
      } finally {
        if (mounted) setLoadingComments(false)
      }
    }

    load()

    return () => { mounted = false }
  }, [activity.id, authUser.uid])

  const handleToggleLike = async () => {
    try {
      const res = await toggleLikeActivity({ activityId: activity.id, uid: authUser.uid })
      const nextLikes = res.liked ? likes + 1 : Math.max(0, likes - 1)
      setLiked(res.liked)
      setLikes(nextLikes)
      onActivityStatsChange?.({
        activityId: activity.id,
        likesCount: nextLikes,
      })
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddComment = async () => {
    if (!commentText.trim()) return

    try {
      await addComment({
        activityId: activity.id,
        uid: authUser.uid,
        texto: commentText.trim(),
      })
      setCommentText('')
      const page = await getCommentsPage({ activityId: activity.id, pageSize: 10 })
      setComments(page.items)
      setCommentsCursor(page.last)
      const nextCommentsCount = commentsCount + 1
      setCommentsCount(nextCommentsCount)
      onActivityStatsChange?.({
        activityId: activity.id,
        commentsCount: nextCommentsCount,
      })
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteComment = async (commentId) => {
    try {
      await deleteComment({ activityId: activity.id, commentId, uid: authUser.uid })
      setComments((c) => c.filter((x) => x.id !== commentId))
      const nextCommentsCount = Math.max(0, commentsCount - 1)
      setCommentsCount(nextCommentsCount)
      onActivityStatsChange?.({
        activityId: activity.id,
        commentsCount: nextCommentsCount,
      })
      setCommentToDelete(null)
    } catch (e) {
      console.error(e)
    }
  }

  const loadMoreComments = async () => {
    if (!commentsCursor) return
    setLoadingComments(true)
    try {
      const page = await getCommentsPage({ activityId: activity.id, pageSize: 10, cursor: commentsCursor })
      setComments((c) => [...c, ...page.items])
      setCommentsCursor(page.last)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingComments(false)
    }
  }

  return (
    <div className="activity-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="activity-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {activity.actorNick} — {activity.type === 'library_add' ? `agregó ${activity.payload?.count || activity.payload?.volumes?.length || 0} tomos a su biblioteca` : activity.type === 'wishlist_add' ? `agregó ${activity.payload?.count || activity.payload?.volumes?.length || 0} tomos a su lista de deseados` : activity.type === 'thematic_list_create' ? `creó ${activity.payload?.count || activity.payload?.lists?.length || 0} lista/s temática` : 'actividad'}
          </h2>
        </header>

        <div className="activity-modal-content">
          {activity.payload?.volumes ? (
            <div className="activity-modal-covers">
              {activity.payload.volumes.map((v) => (
                <button
                  key={`${v.comicId}-${v.volumeId}`}
                  type="button"
                  className="cover-link"
                  onClick={() => {
                    onClose()
                    onOpenVolume?.({ comicId: v.comicId, volumeId: v.volumeId })
                  }}
                >
                  <img src={v.portada?.dataUrl || ''} alt="portada" />
                </button>
              ))}
            </div>
          ) : null}

          {activity.payload?.lists ? (
            <ul className="activity-modal-lists">
              {activity.payload.lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenThematicList?.(l.id)
                    }}
                    className="list-link"
                  >
                    {l.name} →
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="activity-modal-actions">
          <button type="button" className="like-button" onClick={handleToggleLike}>{liked ? 'Quitar like' : 'Like'} ({likes})</button>
          <button type="button" className="close-button" onClick={onClose}>Cerrar</button>
        </div>

        <div className="activity-comments">
          <h3>Comentarios</h3>
          <div className="add-comment">
            <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Escribe un comentario" />
            <button type="button" onClick={handleAddComment}>Enviar</button>
          </div>

          {comments.map((c) => (
            <div key={c.id} className="comment-item">
              <img src={c.fotoPerfil || ''} alt="avatar" className="comment-avatar" onError={(e) => { e.target.style.display = 'none' }} />
              <div className="comment-body">
                <div className="comment-meta"><strong>{c.nick}</strong> · <span>{new Date(c.fecha?.toDate ? c.fecha.toDate() : c.fecha).toLocaleString('es-ES')}</span></div>
                <p>{c.texto}</p>
              </div>
              {c.uid === authUser.uid ? (
                <button
                  type="button"
                  className="comment-delete"
                  onClick={() => setCommentToDelete(c.id)}
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          ))}

          {commentsCursor ? <button type="button" onClick={loadMoreComments} disabled={loadingComments}>Ver más comentarios</button> : null}
        </div>
      </section>

      {commentToDelete ? (
        <section
          className="activity-confirm-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="activity-confirm-title">Eliminar comentario</p>
          <p className="activity-confirm-text">Esta acción no se puede deshacer. ¿Deseas continuar?</p>
          <div className="activity-confirm-actions">
            <button
              type="button"
              className="profile-back-button"
              onClick={() => setCommentToDelete(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="delete-account-button"
              onClick={() => handleDeleteComment(commentToDelete)}
            >
              Eliminar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default ActivityModal
