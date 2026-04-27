import { useEffect, useMemo, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import { getUserWishlistItems } from '../firebase/volumeLists'
import '../styles/UserListPage.css'

function WishlistPage({ authUser, onOpenVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allVolumes, setAllVolumes] = useState([])
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadWishlistItems() {
      if (!authUser?.uid) {
        if (!cancelled) {
          setAllVolumes([])
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setError('')

        const nextItems = await getUserWishlistItems({ uid: authUser.uid })

        const flatVolumes = nextItems.flatMap((item) =>
          item.volumes.map((volume) => ({
            ...volume,
            comicId: item.comicId,
            comicNombre: item.comic.nombre,
            comicEditorial: item.comic.editorial,
            comicAutores: item.comic.autores,
          })),
        )

        if (!cancelled) {
          setAllVolumes(flatVolumes)
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

  const filteredAndSortedVolumes = useMemo(() => {
    let result = [...allVolumes]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (volume) =>
          volume.comicNombre.toLowerCase().includes(query) ||
          volume.comicEditorial?.toLowerCase().includes(query) ||
          volume.comicAutores?.some((autor) => autor.toLowerCase().includes(query)),
      )
    }

    if (sortBy === 'recent') {
      result.sort((a, b) => {
        const dateA = a.fechaAgregado instanceof Date ? a.fechaAgregado : new Date(0)
        const dateB = b.fechaAgregado instanceof Date ? b.fechaAgregado : new Date(0)
        return dateB.getTime() - dateA.getTime()
      })
    } else if (sortBy === 'alphabetical') {
      result.sort((a, b) => a.comicNombre.localeCompare(b.comicNombre, 'es'))
    }

    return result
  }, [allVolumes, sortBy, searchQuery])

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
          <p className="lead">Explora los tomos que deseas agregar a tu colección.</p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="wishlist-controls">
          <div className="wishlist-filter-group">
            <label htmlFor="wishlist-sort">Ordenar por</label>
            <select
              id="wishlist-sort"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="recent">Mostrar añadido más reciente</option>
              <option value="alphabetical">Alfabético</option>
            </select>
          </div>

          <div className="wishlist-filter-group">
            <label htmlFor="wishlist-search">Buscar por nombre o autor</label>
            <input
              id="wishlist-search"
              type="text"
              placeholder="Escribe el nombre del comic, autor o editorial"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {filteredAndSortedVolumes.length === 0 ? (
          <p className="user-empty-state">
            {allVolumes.length === 0
              ? 'No hay tomos en tu lista de deseados.'
              : 'No hay tomos que coincidan con tu búsqueda.'}
          </p>
        ) : (
          <div className="wishlist-volumes-grid">
            {filteredAndSortedVolumes.map((volume) => (
              <VolumeCoverCard
                key={volume.id}
                volume={volume}
                onOpen={() =>
                  onOpenVolume({
                    comicId: volume.comicId,
                    volumeId: volume.id,
                  })
                }
                comicName={volume.comicNombre}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default WishlistPage
