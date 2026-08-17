import React, { useEffect, useState } from 'react'
import ActivityCard from '../Components/ActivityCard'
import ActivityModal from '../Components/ActivityModal'
import Button from '../Components/Button'
import { getActivitiesPage, getActivityById } from '../firebase/activities'
import { getBlockedUsers, getUserFriends, getUsersWhoBlockedUser } from '../firebase/user'
import '../styles/ActivitiesPage.css'

function ActivitiesPage({ authUser, onOpenVolume, onOpenThematicList, onOpenProfile, selectedActivityId, onPageReady }) {
  const [activities, setActivities] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [friends, blockedUsers, usersWhoBlockedMe] = await Promise.all([
          getUserFriends(authUser.uid),
          getBlockedUsers(authUser.uid),
          getUsersWhoBlockedUser(authUser.uid),
        ])

        const blockedUids = new Set([
          ...blockedUsers.map((user) => user.uid),
          ...usersWhoBlockedMe,
        ])

        const friendUids = friends
          .map((friend) => friend.uid)
          .filter((friendUid) => !blockedUids.has(friendUid))

        const page = await getActivitiesPage({ friendUids, pageSize: 10, includeOwnUid: authUser.uid })
        if (!cancelled) {
          setActivities(page.items)
          setCursor(page.last)
          setError('')

          // Si se selecciona una actividad, la busca y la carga en el modal
          if (selectedActivityId) {
            const activity = await getActivityById(selectedActivityId)
            if (activity && !cancelled) {
              setSelected(activity)
            }
          }
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No fue posible cargar las actividades.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    load()

    return () => { cancelled = true }
  }, [authUser.uid, onPageReady, selectedActivityId])

  const loadMore = async () => {
    if (!cursor) return
    setLoading(true)
    try {
      const [friends, blockedUsers, usersWhoBlockedMe] = await Promise.all([
        getUserFriends(authUser.uid),
        getBlockedUsers(authUser.uid),
        getUsersWhoBlockedUser(authUser.uid),
      ])

      const blockedUids = new Set([
        ...blockedUsers.map((user) => user.uid),
        ...usersWhoBlockedMe,
      ])

      const friendUids = friends
        .map((friend) => friend.uid)
        .filter((friendUid) => !blockedUids.has(friendUid))

      const page = await getActivitiesPage({ friendUids, pageSize: 10, cursor, includeOwnUid: authUser.uid })
      // Hago una lista con actividades existentes, luego hago otra lista con las nuevas actividades 
      // que no esten en la lista existente y las junto para evitar duplicados
      setActivities((s) => {
        const existingIds = new Set(s.map((it) => it.id))
        const newItems = page.items.filter((it) => !existingIds.has(it.id))
        return [...s, ...newItems]
      })
      setCursor(page.last)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  //Si se actualizan los likes o comentarios de la actividad, se refleja en la lista 
  // y en el modal si es que la actividad abierta es la misma
  const handleActivityStatsChange = ({ activityId, cantidadLikes, cantidadComentarios }) => {
    setActivities((currentActivities) =>
      currentActivities.map((activityItem) => {
        if (activityItem.id !== activityId) {
          return activityItem
        }

        return {
          ...activityItem,
          cantidadLikes:
            typeof cantidadLikes === 'number' ? cantidadLikes : activityItem.cantidadLikes,
          cantidadComentarios:
            typeof cantidadComentarios === 'number'
              ? cantidadComentarios
              : activityItem.cantidadComentarios,
        }
      }),
    )

    setSelected((currentSelected) => {
      if (!currentSelected || currentSelected.id !== activityId) {
        return currentSelected
      }

      return {
        ...currentSelected,
        cantidadLikes:
          typeof cantidadLikes === 'number'
            ? cantidadLikes
            : currentSelected.cantidadLikes,
        cantidadComentarios:
          typeof cantidadComentarios === 'number'
            ? cantidadComentarios
            : currentSelected.cantidadComentarios,
      }
    })
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="activities-status-message">Cargando actividades...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell activities-page-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <h1>Actividad de amigos</h1>
            <p className="lead">Aquí verás las actividades recientes de tus amigos.</p>
          </div>
        </div>

        <div className="activities-list">
          {error ? <p className="activities-status-message">{error}</p> : null}

          {activities.length === 0 && !loading && !error ? <p className="activities-status-message">No hay actividades por ahora.</p> : null}

          {activities.map((a) => (
            <ActivityCard key={a.id} activity={a} onOpen={(act) => setSelected(act)} />
          ))}

          {cursor ? (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Button type="button" className="profile-back-button" onClick={loadMore} disabled={loading} variant="secondary">{loading ? 'Cargando...' : 'Ver más actividades'}</Button>
            </div>
          ) : null}
        </div>
      </section>

      {selected ? (
        <ActivityModal
          activity={selected}
          authUser={authUser}
          onClose={() => setSelected(null)}
          onOpenVolume={onOpenVolume}
          onOpenThematicList={onOpenThematicList}
          onOpenProfile={onOpenProfile}
          onActivityStatsChange={handleActivityStatsChange}
        />
      ) : null}
    </main>
  )
}

export default ActivitiesPage
