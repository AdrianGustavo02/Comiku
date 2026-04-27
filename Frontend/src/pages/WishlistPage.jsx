import { useEffect, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import { getUserWishlistItems } from '../firebase/volumeLists'
import '../styles/UserListPage.css'

function formatDate(value) {
  if (!(value instanceof Date)) {
    return 'Sin registro'
  }

  return value.toLocaleDateString('es-AR')
}

function WishlistPage({ authUser, onOpenVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [expandedComicIds, setExpandedComicIds] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadWishlistItems() {
      if (!authUser?.uid) {
        if (!cancelled) {
          setItems([])
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setError('')

        const nextItems = await getUserWishlistItems({ uid: authUser.uid })

        if (!cancelled) {
          setItems(nextItems)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar tu lista de deseados.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadWishlistItems()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  const toggleComicCard = (comicId) => {
    setExpandedComicIds((current) => ({
      ...current,
      [comicId]: !current[comicId],
    }))
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando lista de deseados...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Lista de deseados</p>
          <h1>Tu lista de deseados</h1>
          <p className="lead">Selecciona un comic para ver sus tomos guardados.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        {items.length === 0 ? (
          <p className="user-empty-state">No hay tomos en tu lista de deseados.</p>
        ) : (
          <div className="user-comic-list">
            {items.map((item) => {
              const isExpanded = Boolean(expandedComicIds[item.comicId])

              return (
                <article key={item.comicId} className="user-comic-card">
                  <button
                    type="button"
                    className="user-comic-toggle"
                    onClick={() => toggleComicCard(item.comicId)}
                  >
                    <strong>{item.comic.nombre}</strong>
                    <span>{item.comic.editorial || 'Sin editorial'}</span>
                    <span>Tomos guardados: {item.volumes.length}</span>
                  </button>

                  {isExpanded ? (
                    <div className="user-volume-list">
                      {item.volumes.map((volume) => (
                        <div className="user-volume-item" key={volume.id}>
                          <VolumeCoverCard
                            volume={volume}
                            onOpen={() =>
                              onOpenVolume({
                                comicId: item.comicId,
                                volumeId: volume.id,
                              })
                            }
                          />
                          <div className="user-volume-meta">
                            <p>
                              <strong>Fecha de agregado:</strong>{' '}
                              {formatDate(volume.fechaAgregado)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default WishlistPage
