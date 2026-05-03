import { useEffect, useState } from 'react'
import {
  getUserFriends,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '../firebase/user'
import '../styles/ThematicListsShared.css'

function FriendsPage({ authUser, onOpenProfile, onBack }) {
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processingRequest, setProcessingRequest] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        const [friendsList, requestsList] = await Promise.all([
          getUserFriends(authUser.uid),
          getFriendRequests(authUser.uid),
        ])

        if (!cancelled) {
          setFriends(friendsList)
          setRequests(requestsList)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar los datos.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [authUser.uid])

  const handleAcceptRequest = async (senderUid) => {
    try {
      setProcessingRequest(senderUid)
      await acceptFriendRequest(authUser.uid, senderUid)

      setRequests((prev) => prev.filter((r) => r.senderUid !== senderUid))
      setFriends((prev) => {
        const newFriend = requests.find((r) => r.senderUid === senderUid)
        return newFriend ? [...prev, { uid: newFriend.senderUid, nick: newFriend.nick, fotoPerfil: newFriend.fotoPerfil }] : prev
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible aceptar la solicitud.')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleDeclineRequest = async (senderUid) => {
    try {
      setProcessingRequest(senderUid)
      await declineFriendRequest(authUser.uid, senderUid)
      setRequests((prev) => prev.filter((r) => r.senderUid !== senderUid))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible declinar la solicitud.')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleRemoveFriend = async (friendUid) => {
    try {
      setProcessingRequest(friendUid)
      await removeFriend(authUser.uid, friendUid)
      setFriends((prev) => prev.filter((f) => f.uid !== friendUid))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar el amigo.')
    } finally {
      setProcessingRequest(null)
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Amigos</p>
          <h1>Mis amigos</h1>
          <p className="lead">Aquí puedes ver tus amigos y gestionar solicitudes de amistad.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div style={{ marginBottom: 12 }}>
          <button className="profile-back-button" onClick={onBack} type="button">
            Volver atrás
          </button>
        </div>

        {loading ? (
          <p className="status-message">Cargando datos...</p>
        ) : (
          <>
            {/* Solicitudes de amistad */}
            {requests.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <h2>Solicitudes de amistad ({requests.length})</h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {requests.map((req) => (
                    <li
                      key={req.senderUid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 12,
                        borderBottom: '1px solid #e5e5e5',
                        gap: 12,
                      }}
                    >
                      <img
                        src={req.fotoPerfil}
                        alt={`Foto de ${req.nick}`}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          objectFit: 'cover',
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 500 }}>{req.nick}</p>
                      </div>
                      <button
                        type="button"
                        className="profile-back-button"
                        onClick={() => handleAcceptRequest(req.senderUid)}
                        disabled={processingRequest === req.senderUid}
                      >
                        {processingRequest === req.senderUid ? 'Procesando...' : 'Aceptar'}
                      </button>
                      <button
                        type="button"
                        className="delete-account-button"
                        onClick={() => handleDeclineRequest(req.senderUid)}
                        disabled={processingRequest === req.senderUid}
                      >
                        {processingRequest === req.senderUid ? 'Procesando...' : 'Declinar'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Lista de amigos */}
            <section>
              <h2>Amigos ({friends.length})</h2>
              {friends.length === 0 ? (
                <p className="search-empty-state">
                  {requests.length === 0 ? 'Aún no tienes amigos.' : 'Acepta una solicitud para tener amigos.'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {friends.map((friend) => (
                    <li
                      key={friend.uid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 12,
                        borderBottom: '1px solid #e5e5e5',
                        gap: 12,
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          flex: 1,
                        }}
                        onClick={() => onOpenProfile(friend.uid)}
                      >
                        <img
                          src={friend.fotoPerfil}
                          alt={`Foto de ${friend.nick}`}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 8,
                            objectFit: 'cover',
                          }}
                        />
                        <p style={{ margin: 0, fontWeight: 500, color: 'inherit' }}>{friend.nick}</p>
                      </button>
                      <button
                        type="button"
                        className="delete-account-button"
                        onClick={() => handleRemoveFriend(friend.uid)}
                        disabled={processingRequest === friend.uid}
                      >
                        {processingRequest === friend.uid ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

export default FriendsPage
