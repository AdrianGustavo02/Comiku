import { useEffect, useState } from 'react'
import { deleteThematicList, getUserThematicLists } from '../firebase/thematicLists'
import ConfirmModal from '../Components/ConfirmModal'
import '../styles/ThematicListsShared.css'
import '../styles/MyThematicListsPage.css'

function MyThematicListsPage({ authUser, onEditList, onBack, onOpenList, onPageReady }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lists, setLists] = useState([])
  const [deletingId, setDeletingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadUserLists() {
      if (!authUser?.uid) {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
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
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    loadUserLists()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  const handleDeleteList = async (listId) => {
    if (!listId) return

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
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <main className="app-shell my-thematic-lists-page loading">
        <section className="app-card loading-card">
          <p className="status-message">Cargando tus listas...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell my-thematic-lists-page">
      <section className="app-card user-list-page">
        <header className="my-lists-page-header">
          <div className="my-lists-page-header-text">
            <h1>Mis listas temáticas</h1>
            <p className="lead">Gestiona tus listas temáticas.</p>
          </div>

          <button className="back-button" onClick={onBack} type="button">
            Volver
          </button>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

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
                    {list.esGuiaDeLectura ? <span>📖 Guía de lectura</span> : null}
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
                    onClick={() => setDeleteTarget(list)}
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

        {deleteTarget ? (
          <ConfirmModal
            title="Eliminar lista temática"
            message={`Esta acción eliminará la lista "${deleteTarget.nombre}". No se puede deshacer esta acción.`}
            confirmLabel={deletingId === deleteTarget.id ? 'Eliminando...' : 'Eliminar'}
            confirmDisabled={deletingId === deleteTarget.id}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => handleDeleteList(deleteTarget.id)}
          />
        ) : null}
      </section>
    </main>
  )
}

export default MyThematicListsPage
