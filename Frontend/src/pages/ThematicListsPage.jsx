import { useEffect, useMemo, useState } from 'react'
import { getAllThematicLists } from '../firebase/thematicLists'
import '../styles/ThematicListsShared.css'
import '../styles/ThematicListsPage.css'

const LIST_FILTERS = [
  {
    id: 'popular',
    label: 'Populares',
  },
  {
    id: 'recent',
    label: 'Mas recientes',
  },
  {
    id: 'reading-guide',
    label: 'Guia de lectura',
  },
]

function getListDateValue(list) {
  const value = list.fechaCreacion

  if (!value) {
    return 0
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  return 0
}

function getPopularityScore(list) {
  return (Number(list.cantidadLikes) || 0) * 2 + (Number(list.cantidadComentarios) || 0)
}

function ThematicListsPage({
  authUser,
  onOpenList,
  onCreateList,
  onOpenMyLists,
  onOpenVolume,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lists, setLists] = useState([])
  const [activeFilter, setActiveFilter] = useState('popular')

  useEffect(() => {
    let cancelled = false

    async function loadThematicLists() {
      try {
        setLoading(true)
        setError('')

        const nextLists = await getAllThematicLists()

        if (!cancelled) {
          setLists(nextLists)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar las listas temáticas.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadThematicLists()

    return () => {
      cancelled = true
    }
  }, [])

  const visibleLists = useMemo(() => {
    const nextLists = [...lists]

    if (activeFilter === 'recent') {
      return nextLists.sort((a, b) => getListDateValue(b) - getListDateValue(a))
    }

    if (activeFilter === 'reading-guide') {
      return nextLists
        .filter((list) => list.esGuiaDeLectura)
        .sort((a, b) => {
          const scoreDiff = getPopularityScore(b) - getPopularityScore(a)

          if (scoreDiff !== 0) {
            return scoreDiff
          }

          return getListDateValue(b) - getListDateValue(a)
        })
    }

    return nextLists.sort((a, b) => {
      const scoreDiff = getPopularityScore(b) - getPopularityScore(a)

      if (scoreDiff !== 0) {
        return scoreDiff
      }

      const dateDiff = getListDateValue(b) - getListDateValue(a)

      if (dateDiff !== 0) {
        return dateDiff
      }

      return a.nombre.localeCompare(b.nombre, 'es')
    })
  }, [activeFilter, lists])

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando listas temáticas...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card user-list-page">
        <header>
          <p className="eyebrow">Comiku / Listas temáticas</p>
          <h1>Listas temáticas</h1>
          <p className="lead">
            Explora guías de lectura y listas destacadas creadas por la comunidad.
          </p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="thematic-lists-controls">
          <button
            className="primary-button"
            onClick={onCreateList}
            type="button"
          >
            Crear lista temática
          </button>

          {authUser?.uid && (
            <button
              className="secondary-button"
              onClick={onOpenMyLists}
              type="button"
            >
              Mis listas temáticas
            </button>
          )}
        </div>

        <div className="thematic-filter-menu">
          <label className="thematic-filter-label" htmlFor="thematic-list-filter">
            Ordenar por
          </label>
          <select
            id="thematic-list-filter"
            className="thematic-filter-select"
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value)}
          >
            {LIST_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>

        {visibleLists.length === 0 ? (
          <p className="user-empty-state">
            {activeFilter === 'reading-guide'
              ? 'No hay guias de lectura disponibles por ahora.'
              : 'No hay listas tematicas disponibles por ahora.'}
          </p>
        ) : (
          <div className="thematic-lists-grid">
            {visibleLists.map((list) => (
              <article
                key={list.id}
                className="thematic-list-card"
                onClick={() => onOpenList(list.id)}
              >
                <div className="thematic-list-cover">
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

                <div className="thematic-list-info">
                  <strong>{list.nombre}</strong>
                  <p>{list.descripcion || 'Sin descripción'}</p>
                  <div className="thematic-list-meta">
                    <span>
                      {list.esGuiaDeLectura ? '📖 Guía de lectura' : '⭐ Destacados'}
                    </span>
                    <span>{list.cantidadLikes} me gusta</span>
                    <span>{list.cantidadComentarios} comentarios</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default ThematicListsPage
