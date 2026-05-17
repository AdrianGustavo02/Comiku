import React, { useEffect, useState } from 'react'
import ActivityCard from '../Components/ActivityCard'
import ActivityModal from '../Components/ActivityModal'
import Button from '../Components/Button'
import { getActivitiesPage, getActivityById } from '../firebase/activities'
import { getBlockedUsers, getUserFriends, getUsersWhoBlockedUser } from '../firebase/user'
import '../styles/ActivitiesPage.css'

function ActivitiesPage({ authUser, onBack, onOpenVolume, onOpenThematicList, selectedActivityId }) {
  const [activities, setActivities] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
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

          // Si hay un selectedActivityId, búscalo y abrelo
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
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => { cancelled = true }
  }, [authUser.uid, selectedActivityId])

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
      // Evitar duplicados si la actividad propia ya estaba en la lista
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

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Comiku / Actividad</p>
            <h1>Actividad de amigos</h1>
            <p className="lead">Aquí verás las actividades recientes de tus amigos.</p>
          </div>
          <div className="hero-actions">
            <Button className="profile-back-button" onClick={onBack} type="button" variant="secondary">Volver</Button>
          </div>
        </div>

        <div className="activities-list">
          {error ? <p className="status-message">{error}</p> : null}

          {activities.length === 0 && !loading && !error ? <p className="status-message">No hay actividades por ahora.</p> : null}

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
          onActivityStatsChange={handleActivityStatsChange}
        />
      ) : null}
    </main>
  )
}

export default ActivitiesPage
