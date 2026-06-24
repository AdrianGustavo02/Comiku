import { useEffect, useState } from 'react'
import {
  getUserFriends,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '../firebase/user'
import '../styles/FriendsPage.css'

function FriendsPage({ authUser, onOpenProfile, onBack, onPageReady }) {
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processingRequest, setProcessingRequest] = useState(null)
  const [processingAction, setProcessingAction] = useState(null)

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
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [authUser.uid])

  //Marco la solicitud en curso para deshabilitar los botones. Luego llamo a la funcion acceptFriendRequest.
  const handleAcceptRequest = async (senderUid) => {
    try {
      setProcessingRequest(senderUid)
      setProcessingAction('accept')
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
      setProcessingAction(null)
    }
  }

  //Nuevamente deshabilito los botones y llamo a declineFriendRequest.
  const handleDeclineRequest = async (senderUid) => {
    try {
      setProcessingRequest(senderUid)
      setProcessingAction('decline')
      await declineFriendRequest(authUser.uid, senderUid)
      setRequests((prev) => prev.filter((r) => r.senderUid !== senderUid))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible declinar la solicitud.')
    } finally {
      setProcessingRequest(null)
      setProcessingAction(null)
    }
  }

  // Para eliminar un amigo, seteo la solicitud en curso para deshabilitar los botones y llamo a removeFriend.
  const handleRemoveFriend = async (friendUid) => {
    try {
      setProcessingRequest(friendUid)
      setProcessingAction('remove')
      await removeFriend(authUser.uid, friendUid)
      setFriends((prev) => prev.filter((f) => f.uid !== friendUid))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar el amigo.')
    } finally {
      setProcessingRequest(null)
      setProcessingAction(null)
    }
  }

  return (
    <main className="app-shell friends-page-shell">
      <section className="app-card user-list-page friends-page-card">
        <header>
          <h1>Amigos</h1>
          <p className="lead">Aquí puedes ver tus amigos y gestionar solicitudes de amistad.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        {loading ? (
          <p className="status-message">Cargando datos...</p>
        ) : (
          <>
            {requests.length > 0 && (
              <section className="friends-requests-section">
                <h2>Solicitudes de amistad ({requests.length})</h2>
                <ul className="friends-list">
                  {requests.map((req) => (
                    <li key={req.senderUid} className="friends-list-item">
                      <button
                        type="button"
                        className="friend-profile-link"
                        onClick={() => onOpenProfile(req.senderUid)}
                      >
                        <img
                          src={req.fotoPerfil}
                          alt={`Foto de ${req.nick}`}
                          className="friend-avatar"
                        />
                        <p className="friend-nick">{req.nick}</p>
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleAcceptRequest(req.senderUid)}
                        disabled={processingRequest === req.senderUid}
                      >
                        {processingRequest === req.senderUid && processingAction === 'accept' ? 'Procesando...' : 'Aceptar'}
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDeclineRequest(req.senderUid)}
                        disabled={processingRequest === req.senderUid}
                      >
                        {processingRequest === req.senderUid && processingAction === 'decline' ? 'Procesando...' : 'Declinar'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            
            <section>
              <h2>Amigos ({friends.length})</h2>
              {friends.length === 0 ? (
                <p className="search-empty-state-black">
                  {requests.length === 0 ? 'Aún no tienes amigos.' : 'Acepta una solicitud para tener amigos.'}
                </p>
              ) : (
                <ul className="friends-list">
                  {friends.map((friend) => (
                    <li key={friend.uid} className="friends-list-item">
                      <button
                        type="button"
                        className="friend-profile-link"
                        onClick={() => onOpenProfile(friend.uid)}
                      >
                        <img
                          src={friend.fotoPerfil}
                          alt={`Foto de ${friend.nick}`}
                          className="friend-avatar"
                        />
                        <p className="friend-nick">{friend.nick}</p>
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleRemoveFriend(friend.uid)}
                        disabled={processingRequest === friend.uid}
                      >
                        {processingRequest === friend.uid && processingAction === 'remove' ? 'Eliminando...' : 'Eliminar'}
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
