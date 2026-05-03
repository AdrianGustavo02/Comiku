import { useEffect, useMemo, useState } from 'react'
import { getAllUsers, isUserBlocked } from '../firebase/user'
import '../styles/ThematicListsShared.css'
import '../styles/ThematicListsPage.css'

function normalizeText(value) {
  return (value || '').toLowerCase().trim()
}

function ChatsPage({ authUser, onOpenProfile, onOpenFriends }) {
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [blockedByMeMap, setBlockedByMeMap] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      try {
        setLoading(true)
        const all = await getAllUsers()
        if (!cancelled) setUsers(all)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No fue posible cargar usuarios')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUsers()

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedQuery = normalizeText(query)

  const results = useMemo(() => {
    if (!normalizedQuery) return []
    return users.filter((u) => normalizeText(u.nick).includes(normalizedQuery))
  }, [users, normalizedQuery])
  
  const [visibleCount, setVisibleCount] = useState(15)
  const visibleResults = useMemo(() => results.slice(0, visibleCount), [results, visibleCount])

  useEffect(() => {
    let cancelled = false

    async function loadBlockedStatuses() {
      if (!authUser?.uid || visibleResults.length === 0) {
        setBlockedByMeMap({})
        return
      }

      const entries = await Promise.all(
        visibleResults.map(async (user) => {
          try {
            const blockedMe = await isUserBlocked(authUser.uid, user.uid)
            return [user.uid, blockedMe]
          } catch {
            return [user.uid, false]
          }
        })
      )

      if (!cancelled) {
        setBlockedByMeMap(Object.fromEntries(entries))
      }
    }

    loadBlockedStatuses()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, visibleResults])

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Chats</p>
          <h1>Chats</h1>
          <p className="lead">Busca usuarios por su nick para abrir su perfil público.</p>
        </header>

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="profile-back-button"
            onClick={onOpenFriends}
            style={{ marginRight: 8 }}
          >
            Mis amigos
          </button>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="thematic-search-bar">
          <label className="thematic-search-label" htmlFor="chat-user-search">Buscar usuario por nick</label>
          <input
            id="chat-user-search"
            className="thematic-search-input"
            type="search"
            placeholder="Busca un nick..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="status-message">Cargando usuarios...</p>
        ) : (
          <div>
            {normalizedQuery && results.length === 0 ? (
              <p className="search-empty-state">No se encontraron coincidencias con ese nick.</p>
            ) : null}

            {results.length > 0 && (
              <ul className="search-suggestion-list" role="listbox">
                {visibleResults.map((u) => (
                  <li key={u.uid}>
                    <button
                      type="button"
                      className="search-suggestion-button"
                      onClick={() => onOpenProfile(u.uid)}
                      disabled={Boolean(blockedByMeMap[u.uid])}
                    >
                      <img src={u.fotoPerfil} alt={`Foto de ${u.nick}`} style={{width:40,height:40,borderRadius:8,objectFit:'cover',marginRight:12}} />
                      <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',lineHeight:1.2}}>
                        <strong>{u.nick}</strong>
                        {blockedByMeMap[u.uid] ? (
                          <span style={{fontSize:12,opacity:0.8}}>Este usuario te bloqueo</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {results.length > visibleCount && (
              <div style={{marginTop:12}}>
                <button
                  type="button"
                  className="thematic-load-more"
                  onClick={() => setVisibleCount((c) => c + 15)}
                >
                  Mostrar 15 más
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default ChatsPage
