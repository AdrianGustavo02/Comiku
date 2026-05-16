import { useEffect, useState } from 'react'
import {
  getNotificationsPage,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  NOTIFICATION_TYPES,
} from '../firebase/notifications'
import { getActivityById } from '../firebase/activities'
import '../styles/NotificationsPage.css'

export default function NotificationsPage({ authUser }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const PAGE_SIZE = 15

  useEffect(() => {
    if (!authUser?.uid) {
      window.history.replaceState({}, '', '/login')
      return
    }
  }, [authUser?.uid])

  useEffect(() => {
    if (!authUser?.uid) return

    const loadNotifications = async () => {
      try {
        setLoading(true)
        setErrorMessage('')
        const result = await getNotificationsPage({
          userId: authUser.uid,
          pageSize: PAGE_SIZE,
          cursor: null,
        })

        // Enriquecer notificaciones con detalles de actividad cuando aplique
        try {
          const enriched = await Promise.all(
            result.notifications.map(async (n) => {
              if (
                (n.type === NOTIFICATION_TYPES.ACTIVITY_LIKE || n.type === NOTIFICATION_TYPES.ACTIVITY_COMMENT) &&
                n.metadata?.activityId
              ) {
                try {
                  const activity = await getActivityById(n.metadata.activityId)
                  return { ...n, activityType: activity?.type || null }
                } catch {
                  return { ...n, activityType: null }
                }
              }

              return n
            }),
          )

          setNotifications(enriched)
        } catch {
          // si falla el enriquecimiento, usar las notificaciones sin enriquecer
          setNotifications(result.notifications)
        }
        setCursor(result.lastCursor)
        setHasMore(result.notifications.length >= PAGE_SIZE)

        const count = await getUnreadNotificationsCount(authUser.uid)
        setUnreadCount(count)
      } catch (error) {
        console.error('Error loading notifications:', error)
        setErrorMessage(error instanceof Error ? error.message : 'No fue posible cargar las notificaciones.')
      } finally {
        setLoading(false)
      }
    }

    loadNotifications()
  }, [authUser?.uid])

  const handleLoadMore = async () => {
    if (!cursor || !authUser?.uid) return

    try {
      const result = await getNotificationsPage({
        userId: authUser.uid,
        pageSize: PAGE_SIZE,
        cursor,
      })

      // Enriquecer las nuevas notificaciones antes de agregarlas
      try {
        const enrichedNew = await Promise.all(
          result.notifications.map(async (n) => {
            if (
              (n.type === NOTIFICATION_TYPES.ACTIVITY_LIKE || n.type === NOTIFICATION_TYPES.ACTIVITY_COMMENT) &&
              n.metadata?.activityId
            ) {
              try {
                const activity = await getActivityById(n.metadata.activityId)
                return { ...n, activityType: activity?.type || null }
              } catch {
                return { ...n, activityType: null }
              }
            }

            return n
          }),
        )

        setNotifications((prev) => [...prev, ...enrichedNew])
      } catch {
        setNotifications((prev) => [...prev, ...result.notifications])
      }
      setCursor(result.lastCursor)
      setHasMore(result.notifications.length >= PAGE_SIZE)
    } catch (error) {
      console.error('Error loading more notifications:', error)
      setErrorMessage(error instanceof Error ? error.message : 'No fue posible cargar más notificaciones.')
    }
  }

  const handleNotificationClick = async (notification) => {
    // Marcar como leída
    if (!notification.leido) {
      try {
        await markNotificationAsRead(notification.id)
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, leido: true } : n,
          ),
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch (error) {
        console.error('Error marking notification as read:', error)
      }
    }

    // Navegar según el tipo
    let targetPath = ''
    switch (notification.type) {
      case NOTIFICATION_TYPES.ACTIVITY_LIKE:
      case NOTIFICATION_TYPES.ACTIVITY_COMMENT:
        targetPath = `/actividades/${notification.metadata.activityId}`
        break

      case NOTIFICATION_TYPES.FRIEND_REQUEST:
        targetPath = '/amigos'
        break

      case NOTIFICATION_TYPES.THEMATIC_LIST_LIKE:
      case NOTIFICATION_TYPES.THEMATIC_LIST_COMMENT:
        targetPath = `/listas-tematicas/ver/${encodeURIComponent(notification.metadata.listId)}`
        break

      default:
        break
    }

    if (targetPath) {
      window.history.pushState({}, '', targetPath)
      // Disparar evento popstate para que Home se refresque
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!authUser?.uid) return

    try {
      await markAllNotificationsAsRead(authUser.uid)
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, leido: true })),
      )
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const getNotificationText = (notification) => {
    const { type, actorNick, activityType } = notification

    const verb = type === NOTIFICATION_TYPES.ACTIVITY_LIKE ? 'le dio like a' : 'comentó en'

    if (type === NOTIFICATION_TYPES.ACTIVITY_LIKE || type === NOTIFICATION_TYPES.ACTIVITY_COMMENT) {
      switch (activityType) {
        case 'library_add':
          return `${actorNick} ${verb} tu adicion de tomos a biblioteca.`

        case 'wishlist_add':
          return `${actorNick} ${verb} tu adicion de tomos a deseados.`

        case 'thematic_list_create':
          return `${actorNick} ${verb} tu creacion de lista temática.`

        default:
          return `${actorNick} ${verb} tu actividad.`
      }
    }

    switch (type) {
      case NOTIFICATION_TYPES.FRIEND_REQUEST:
        return `${actorNick} te envió una solicitud de amistad`

      case NOTIFICATION_TYPES.THEMATIC_LIST_LIKE:
        return `${actorNick} le dio like a tu lista temática`

      case NOTIFICATION_TYPES.THEMATIC_LIST_COMMENT:
        return `${actorNick} comentó en tu lista temática`

      default:
        return 'Nueva notificación'
    }
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case NOTIFICATION_TYPES.ACTIVITY_LIKE:
      case NOTIFICATION_TYPES.THEMATIC_LIST_LIKE:
        return '❤️'

      case NOTIFICATION_TYPES.ACTIVITY_COMMENT:
      case NOTIFICATION_TYPES.THEMATIC_LIST_COMMENT:
        return '💬'

      case NOTIFICATION_TYPES.FRIEND_REQUEST:
        return '👥'

      default:
        return '🔔'
    }
  }

  const formatDate = (fecha) => {
    if (!fecha) return ''

    const date = fecha.toDate ? fecha.toDate() : new Date(fecha)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Hace poco'
    if (diffMins < 60) return `Hace ${diffMins} min`
    if (diffHours < 24) return `Hace ${diffHours} h`
    if (diffDays < 7) return `Hace ${diffDays} d`

    return date.toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="notifications-page">
        <div className="notifications-header">
          <h1>Notificaciones</h1>
        </div>
        <div className="loading">Cargando notificaciones...</div>
      </div>
    )
  }

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>Notificaciones</h1>
        {unreadCount > 0 && (
          <button
            className="mark-all-read-btn"
            onClick={handleMarkAllAsRead}
            title="Marcar todas como leídas"
          >
            Marcar todas como leídas ({unreadCount})
          </button>
        )}
      </div>

      <div className="notifications-container">
        {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

        {notifications.length === 0 ? (
          <div className="empty-state">
            <p>No tienes notificaciones</p>
          </div>
        ) : (
          <>
            <div className="notifications-list">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.leido ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-avatar">
                    {notification.actorFotoPerfil ? (
                      <img
                        src={notification.actorFotoPerfil}
                        alt={notification.actorNick}
                      />
                    ) : (
                      <div className="avatar-placeholder">
                        {notification.actorNick?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>

                  <div className="notification-content">
                    <div className="notification-text">
                      <span className="notification-icon">
                        {getNotificationIcon(notification.type)}
                      </span>
                      <p>{getNotificationText(notification)}</p>
                    </div>
                    <span className="notification-date">
                      {formatDate(notification.fecha)}
                    </span>
                  </div>

                  {!notification.leido && (
                    <div className="unread-indicator"></div>
                  )}
                </div>
              ))}
            </div>

            {hasMore && (
              <button
                className="load-more-btn"
                onClick={handleLoadMore}
              >
                Cargar más
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
