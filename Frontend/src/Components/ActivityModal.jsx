import React, { useEffect, useRef, useState } from 'react'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import '../styles/ActivitiesPage.css'
import {
  toggleLikeActivity,
  getCantidadLikes,
  addComment,
  deleteComment,
  getCommentsPage,
  getUserLikeStatus,
} from '../firebase/activities'

const COMMENTS_PAGE_SIZE = 10

function ActivityModal({
  activity,
  onClose,
  authUser,
  onOpenVolume,
  onOpenThematicList,
  onOpenProfile,
  onActivityStatsChange,
}) {
  const [cantidadLikes, setCantidadLikes] = useState(0)
  const [liked, setLiked] = useState(false)
  const [comments, setComments] = useState([])
  const [commentsCursor, setCommentsCursor] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [cantidadComentarios, setCantidadComentarios] = useState(
    activity.cantidadComentarios || 0,
  )
  const [processingComment, setProcessingComment] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState(null)
  const [processingLike, setProcessingLike] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    setCantidadComentarios(activity.cantidadComentarios || 0)
  }, [activity.cantidadComentarios, activity.id])

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [count, likeStatus] = await Promise.all([
          getCantidadLikes(activity.id),
          getUserLikeStatus(activity.id, authUser.uid),
        ])
        if (mounted) {
          setCantidadLikes(count)
          setLiked(likeStatus)
        }
      } catch (e) {
        void e
      }

      try {
        setLoadingComments(true)
        const page = await getCommentsPage({ activityId: activity.id, pageSize: COMMENTS_PAGE_SIZE })
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

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: false })
    dialogRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  const handleToggleLike = async () => {
    if (processingLike) return

    try {
      setProcessingLike(true)
      const res = await toggleLikeActivity({ activityId: activity.id, uid: authUser.uid })
      const nextCantidadLikes = res.liked ? cantidadLikes + 1 : Math.max(0, cantidadLikes - 1)
      setLiked(res.liked)
      setCantidadLikes(nextCantidadLikes)
      onActivityStatsChange?.({
        activityId: activity.id,
        cantidadLikes: nextCantidadLikes,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setProcessingLike(false)
    }
  }

  const handleAddComment = async () => {
    const cleanCommentText = sanitizeForbiddenInputChars(commentText).trim()

    if (!cleanCommentText) return

    if (processingComment) return

    try {
      setProcessingComment(true)
      await addComment({
        activityId: activity.id,
        uid: authUser.uid,
        texto: cleanCommentText,
      })
      setCommentText('')
      const page = await getCommentsPage({ activityId: activity.id, pageSize: COMMENTS_PAGE_SIZE })
      setComments(page.items)
      setCommentsCursor(page.last)
      const nextCantidadComentarios = cantidadComentarios + 1
      setCantidadComentarios(nextCantidadComentarios)
      onActivityStatsChange?.({
        activityId: activity.id,
        cantidadComentarios: nextCantidadComentarios,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setProcessingComment(false)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (deletingCommentId) return

    try {
      setDeletingCommentId(commentId)
      await deleteComment({ activityId: activity.id, commentId, uid: authUser.uid })
      setComments((c) => c.filter((x) => x.id !== commentId))
      const nextCantidadComentarios = Math.max(0, cantidadComentarios - 1)
      setCantidadComentarios(nextCantidadComentarios)
      onActivityStatsChange?.({
        activityId: activity.id,
        cantidadComentarios: nextCantidadComentarios,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingCommentId(null)
    }
  }

  const loadMoreComments = async () => {
    if (!commentsCursor) return
    setLoadingComments(true)
    try {
      const page = await getCommentsPage({ activityId: activity.id, pageSize: COMMENTS_PAGE_SIZE, cursor: commentsCursor })
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
      <section className="activity-modal" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
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
          <button
            type="button"
            className={`like-button ${liked ? 'liked' : ''}`}
            onClick={handleToggleLike}
            disabled={processingLike}
            aria-pressed={liked}
            aria-label={`Me gusta, ${cantidadLikes}`}
          >
            {processingLike ? (
              'Procesando...'
            ) : (
              <>
                <span className="like-icon" aria-hidden="true">
                  {liked ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12.1 21.35l-1.1-1.02C5.14 15.24 2 12.39 2 8.5 2 6 3.99 4 6.5 4c1.74 0 3.41.81 4.6 2.09L12 7.77l.9-.68C14.09 4.81 15.76 4 17.5 4 20.01 4 22 6 22 8.5c0 3.89-3.14 6.74-8.9 11.83l-1 1.02z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="like-count">{cantidadLikes}</span>
              </>
            )}
          </button>
        </div>

        <div className="activity-comments">
          <h3>Comentarios</h3>
          <div className="add-comment">
            <input value={commentText} onChange={(e) => setCommentText(sanitizeForbiddenInputChars(e.target.value))} placeholder="Escribe un comentario" disabled={processingComment} />
            <button type="button" className="like-button send-button" onClick={handleAddComment} disabled={processingComment} aria-label="Enviar comentario">
              {processingComment ? 'Enviando...' : 'Enviar'}
            </button>
          </div>

          {comments.map((c) => (
            <div key={c.id} className="comment-item">
              <img src={c.fotoPerfil || ''} alt="avatar" className="comment-avatar" onError={(e) => { e.target.style.display = 'none' }} />
              <div className="comment-body">
                <div className="comment-meta">
                  <button
                    type="button"
                    onClick={() => onOpenProfile?.(c.uid)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                      font: 'inherit',
                    }}
                  >
                    <strong>{c.nick}</strong>
                  </button>
                  <span>{new Date(c.fecha?.toDate ? c.fecha.toDate() : c.fecha).toLocaleString('es-ES')}</span>
                </div>
                <p>{c.texto}</p>
              </div>
              {c.uid === authUser.uid ? (
                <button
                  type="button"
                  className="comment-delete"
                      onClick={() => handleDeleteComment(c.id)}
                      disabled={deletingCommentId !== null}
                >
                      {deletingCommentId === c.id ? 'Eliminando...' : 'Eliminar'}
                </button>
              ) : null}
            </div>
          ))}

          {commentsCursor ? (
            <button type="button" className="like-button more-comments-button" onClick={loadMoreComments} disabled={loadingComments}>Ver más comentarios</button>
          ) : (
            <p className="activity-comments-end">No hay más comentarios</p>
          )}
        </div>
      </section>

    </div>
  )
}

export default ActivityModal
