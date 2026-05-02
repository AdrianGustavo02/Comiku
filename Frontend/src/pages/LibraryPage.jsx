import { useEffect, useMemo, useState } from 'react'
import { COMIC_GENRES } from '../constants/comicGenres'
import { getUserLibraryItems } from '../firebase/volumeLists'
import '../styles/LibraryPage.css'

function getFeaturedLibraryVolume(volumes) {
  if (!Array.isArray(volumes) || volumes.length === 0) {
    return null
  }

  const sortedVolumes = [...volumes].sort((a, b) => {
    if (a.tomoUnico && !b.tomoUnico) {
      return -1
    }

    if (!a.tomoUnico && b.tomoUnico) {
      return 1
    }

    if (a.numeroTomo === null && b.numeroTomo === null) {
      return 0
    }

    if (a.numeroTomo === null) {
      return 1
    }

    if (b.numeroTomo === null) {
      return -1
    }

    return a.numeroTomo - b.numeroTomo
  })

  return (
    sortedVolumes.find((volume) => volume.numeroTomo === 1) ??
    sortedVolumes.find((volume) => volume.tomoUnico) ??
    sortedVolumes[0]
  )
}

function getFeaturedVolumeTitle(volume) {
  if (!volume) {
    return 'Tomo destacado'
  }

  if (volume.tomoUnico) {
    return 'Tomo único'
  }

  if (volume.numeroTomo !== null) {
    return `Tomo ${volume.numeroTomo}`
  }

  return 'Tomo destacado'
}

function LibraryPage({ authUser, onOpenComic }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [genreFilter, setGenreFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

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
    let nextItems = !genreFilter
      ? items
      : items.filter((item) => item.comic.generos.includes(genreFilter))

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      nextItems = nextItems.filter(
        (item) =>
          item.comic.nombre.toLowerCase().includes(query) ||
          item.comic.editorial?.toLowerCase().includes(query) ||
          item.comic.autores?.some((autor) => autor.toLowerCase().includes(query)),
      )
    }

    return [...nextItems].sort((a, b) => a.comic.nombre.localeCompare(b.comic.nombre, 'es'))
  }, [items, genreFilter, searchQuery])

  const sortedGenres = useMemo(
    () => [...COMIC_GENRES].sort((a, b) => a.localeCompare(b, 'es')),
    [],
  )

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
          <p className="lead">Selecciona un comic para ver su información completa.</p>
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

        <div className="user-list-search">
          <label htmlFor="library-search">Buscar</label>
          <input
            id="library-search"
            type="text"
            placeholder="Escribe el nombre del comic, autor o editorial"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {filteredItems.length === 0 ? (
          <p className="user-empty-state">No hay tomos en tu biblioteca para ese filtro.</p>
        ) : (
          <div className="user-comic-list">
            {filteredItems.map((item) => {
              const featuredVolume = getFeaturedLibraryVolume(item.volumes)

              return (
                <article key={item.comicId} className="user-comic-card">
                  <button
                    type="button"
                    className="user-comic-toggle"
                    onClick={() => onOpenComic?.(item.comicId)}
                  >
                    <div className="user-comic-cover">
                      {featuredVolume?.portada?.dataUrl ? (
                        <img
                          src={featuredVolume.portada.dataUrl}
                          alt={`Portada de ${item.comic.nombre} - ${getFeaturedVolumeTitle(featuredVolume)}`}
                        />
                      ) : (
                        <div className="user-comic-placeholder">Sin portada</div>
                      )}
                    </div>

                    <div className="user-comic-info">
                      <strong>{item.comic.nombre}</strong>
                      <span>{item.comic.editorial || 'Sin editorial'}</span>
                      <span>
                        {featuredVolume ? getFeaturedVolumeTitle(featuredVolume) : 'Sin tomo destacado'}
                      </span>
                      <span>Tomos guardados: {item.volumes.length}</span>
                    </div>
                  </button>
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
