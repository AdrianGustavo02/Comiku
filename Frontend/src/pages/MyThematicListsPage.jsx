import { useEffect, useState } from 'react'
import { deleteThematicList, getUserThematicLists } from '../firebase/thematicLists'
import '../styles/ThematicListsShared.css'
import '../styles/MyThematicListsPage.css'

function MyThematicListsPage({ authUser, onEditList, onBack, onOpenList }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lists, setLists] = useState([])
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadUserLists() {
      if (!authUser?.uid) {
        if (!cancelled) {
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setError('')

        const nextLists = await getUserThematicLists({ userId: authUser.uid })

        if (!cancelled) {
          setLists(nextLists)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar tus listas temáticas.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadUserLists()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  const handleDeleteList = async (listId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta lista?')) {
      return
    }

    try {
      setDeletingId(listId)
      setError('')

      await deleteThematicList({ listId })

      setLists(lists.filter((l) => l.id !== listId))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible eliminar la lista.',
      )
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando tus listas...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Mis listas temáticas</p>
          <h1>Mis listas temáticas</h1>
          <p className="lead">Gestiona y personaliza tus listas temáticas.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="my-lists-actions">
          <button className="back-button" onClick={onBack} type="button">
            Volver
          </button>
        </div>

        {lists.length === 0 ? (
          <p className="user-empty-state">
            Aún no has creado ninguna lista temática.
          </p>
        ) : (
          <div className="my-thematic-lists-grid">
            {lists.map((list) => (
              <article key={list.id} className="my-thematic-list-card">
                <div
                  className="my-thematic-list-cover"
                  onClick={() => onOpenList(list.id)}
                >
                  {list.fotosDePortadas && list.fotosDePortadas.length > 0 ? (
                    <div className="thematic-list-covers-grid">
                      {list.fotosDePortadas.slice(0, 3).map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Portada ${idx + 1}`}
                          className="thematic-list-cover-img"
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3Crect fill="%23ddd" width="100" height="150"/%3E%3C/svg%3E'
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="thematic-list-placeholder">Sin portadas</div>
                  )}
                </div>

                <div className="my-thematic-list-info">
                  <strong>{list.nombre}</strong>
                  <p>{list.descripcion || 'Sin descripción'}</p>
                  <div className="thematic-list-meta">
                    <span>
                      {list.esGuiaDeLectura ? '📖 Guía de lectura' : '⭐ Destacados'}
                    </span>
                  </div>
                </div>

                <div className="my-thematic-list-actions">
                  <button
                    className="secondary-button"
                    onClick={() => onEditList(list.id)}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => handleDeleteList(list.id)}
                    disabled={deletingId === list.id}
                    type="button"
                  >
                    {deletingId === list.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default MyThematicListsPage
