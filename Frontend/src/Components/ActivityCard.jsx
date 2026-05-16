import React from 'react'
import '../styles/ActivitiesPage.css'

function ActivityCard({ activity, onOpen }) {
  const { actorNick, type, payload, fecha } = activity

  const renderPreview = () => {
    const volumes = payload?.volumes || []

    if (volumes.length === 0) return null

    return (
      <div className="activity-preview-covers">
        {volumes.slice(0, 3).map((v, idx) => (
          <img
            key={`${v.comicId}-${v.volumeId}-${idx}`}
            src={v.portada?.dataUrl || ''}
            alt="portada"
            className="activity-cover-thumb"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ))}
        {volumes.length > 3 ? <div className="activity-more">Ver más</div> : null}
      </div>
    )
  }

  const text =
    type === 'library_add'
      ? `${actorNick} agregó ${payload?.count || payload?.volumes?.length || 0} tomo/s a su biblioteca.`
      : type === 'wishlist_add'
      ? `${actorNick} agregó ${payload?.count || payload?.volumes?.length || 0} tomo/s a su lista de deseados.`
      : type === 'thematic_list_create'
      ? `${actorNick} creó ${payload?.count || payload?.lists?.length || 0} lista/s temática.`
      : `${actorNick} realizó una actividad.`

  const cantidadLikes =
    typeof activity.cantidadLikes === 'number' ? activity.cantidadLikes : 0
  const cantidadComentarios =
    typeof activity.cantidadComentarios === 'number' ? activity.cantidadComentarios : 0

  return (
    <article className="activity-card" onClick={() => onOpen(activity)} role="button">
      <div className="activity-card-header">
        <strong>{text}</strong>
        <time className="activity-time">{fecha ? new Date(fecha?.toDate ? fecha.toDate() : fecha).toLocaleString('es-ES') : ''}</time>
      </div>

      {type === 'thematic_list_create' ? (
        <ul className="activity-list-names">
          {(payload?.lists || []).slice(0, 5).map((l) => (
            <li key={l.id} className="activity-list-name">{l.name}</li>
          ))}
          {(payload?.lists || []).length > 5 ? <li className="activity-more">Ver más</li> : null}
        </ul>
      ) : (
        renderPreview()
      )}

      <div className="activity-card-footer">
        <span>❤️ {cantidadLikes}</span>
        <span>💬 {cantidadComentarios}</span>
      </div>
    </article>
  )
}

export default ActivityCard
