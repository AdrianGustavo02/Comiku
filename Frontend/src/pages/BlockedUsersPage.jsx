import { useEffect, useState } from 'react'
import { getBlockedUsers, unblockUser } from '../firebase/user'
import '../styles/ThematicListsShared.css'

function BlockedUsersPage({ authUser, onBack }) {
  const [blockedUsers, setBlockedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processingUid, setProcessingUid] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadBlockedUsers() {
      try {
        setLoading(true)
        const blocked = await getBlockedUsers(authUser.uid)

        if (!cancelled) {
          setBlockedUsers(blocked)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar usuarios bloqueados.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadBlockedUsers()

    return () => {
      cancelled = true
    }
  }, [authUser.uid])

  const handleUnblock = async (blockedUid) => {
    try {
      setProcessingUid(blockedUid)
      await unblockUser(authUser.uid, blockedUid)
      setBlockedUsers((prev) => prev.filter((u) => u.uid !== blockedUid))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible desbloquear el usuario.')
    } finally {
      setProcessingUid(null)
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Usuarios Bloqueados</p>
          <h1>Usuarios bloqueados</h1>
          <p className="lead">Aquí puedes ver y gestionar los usuarios que has bloqueado.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div style={{ marginBottom: 12 }}>
          <button className="profile-back-button" onClick={onBack} type="button">
            Volver a mi perfil
          </button>
        </div>

        {loading ? (
          <p className="status-message">Cargando usuarios bloqueados...</p>
        ) : (
          <section>
            <h2>Bloqueados ({blockedUsers.length})</h2>
            {blockedUsers.length === 0 ? (
              <p className="search-empty-state">No tienes usuarios bloqueados.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {blockedUsers.map((user) => (
                  <li
                    key={user.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 12,
                      borderBottom: '1px solid #e5e5e5',
                      gap: 12,
                    }}
                  >
                    <img
                      src={user.fotoPerfil}
                      alt={`Foto de ${user.nick}`}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        objectFit: 'cover',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 500 }}>{user.nick}</p>
                      {user.fechaBloqueo && (
                        <p style={{ margin: 0, fontSize: 12, color: '#999' }}>
                          Bloqueado el {user.fechaBloqueo.toLocaleDateString('es-AR')}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="profile-back-button"
                      onClick={() => handleUnblock(user.uid)}
                      disabled={processingUid === user.uid}
                    >
                      {processingUid === user.uid ? 'Desbloqueando...' : 'Desbloquear'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

export default BlockedUsersPage
