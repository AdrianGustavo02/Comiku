import { useEffect, useMemo, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import { COMIC_GENRES } from '../constants/comicGenres'
import { getUserLibraryItems } from '../firebase/volumeLists'
import '../styles/UserListPage.css'

function formatDate(value) {
  if (!(value instanceof Date)) {
    return 'Sin registros'
  }

  return value.toLocaleDateString('es-AR')
}

function LibraryPage({ authUser, onOpenVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [expandedComicIds, setExpandedComicIds] = useState({})
  const [genreFilter, setGenreFilter] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadLibraryItems() {
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

        const nextItems = await getUserLibraryItems({ uid: authUser.uid })

        if (!cancelled) {
          setItems(nextItems)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar tu biblioteca.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadLibraryItems()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  const filteredItems = useMemo(() => {
    if (!genreFilter) {
      return items
    }

    return items.filter((item) => item.comic.generos.includes(genreFilter))
  }, [items, genreFilter])

  const sortedGenres = useMemo(
    () => [...COMIC_GENRES].sort((a, b) => a.localeCompare(b, 'es')),
    [],
  )

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
          <p className="status-message">Cargando biblioteca...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Biblioteca</p>
          <h1>Tu biblioteca</h1>
          <p className="lead">Selecciona un comic para ver sus tomos guardados.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="user-list-filter">
          <label htmlFor="library-genre-filter">Filtrar por género</label>
          <select
            id="library-genre-filter"
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.target.value)}
          >
            <option value="">Todos los géneros</option>
            {sortedGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>

        {filteredItems.length === 0 ? (
          <p className="user-empty-state">No hay tomos en tu biblioteca para ese filtro.</p>
        ) : (
          <div className="user-comic-list">
            {filteredItems.map((item) => {
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
                              <strong>Leído:</strong> {volume.leido ? 'Sí' : 'No'}
                            </p>
                            <p>
                              <strong>Fechas de lectura:</strong>{' '}
                              {volume.fechaLectura.length > 0
                                ? volume.fechaLectura.map(formatDate).join(' | ')
                                : 'Sin registros'}
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

export default LibraryPage
