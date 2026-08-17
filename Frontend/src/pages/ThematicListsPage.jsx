import { useEffect, useMemo, useState } from 'react'
import { getAllThematicLists, getUserSavedThematicLists } from '../firebase/thematicLists'
import { getUsersWhoBlockedUser, getUserProfile } from '../firebase/user'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import Button from '../Components/Button'
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
  {
    id: 'saved',
    label: 'Mis listas guardadas',
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
  onPageReady,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lists, setLists] = useState([])
  const [activeFilter, setActiveFilter] = useState('popular')
  const [searchTerm, setSearchTerm] = useState('')
  const [visibleCount, setVisibleCount] = useState(15)
  const [blockedByUsers, setBlockedByUsers] = useState([])
  const [creatorProfiles, setCreatorProfiles] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadThematicLists() {
      try {
        setLoading(true)
        setError('')

        let nextLists = []

        if (activeFilter === 'saved' && authUser?.uid) {
          nextLists = await getUserSavedThematicLists({ userId: authUser.uid })
        } else {
          nextLists = await getAllThematicLists()
        }

        const [blockedCreators] = await Promise.all([
          authUser?.uid ? getUsersWhoBlockedUser(authUser.uid) : Promise.resolve([]),
        ])

        //Cargo el perfil del creador
        const uniqueCreatorIds = [...new Set(nextLists.map((l) => l.userId).filter(Boolean))]
        const profiles = {}

        for (const creatorId of uniqueCreatorIds) {
          try {
            const profile = await getUserProfile(creatorId)
            profiles[creatorId] = profile?.nick || profile?.nombre || creatorId
          } catch {
            profiles[creatorId] = creatorId
          }
        }

        if (!cancelled) {
          setLists(nextLists)
          setBlockedByUsers(blockedCreators)
          setCreatorProfiles(profiles)
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
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    loadThematicLists()

    return () => {
      cancelled = true
    }
  }, [activeFilter, authUser?.uid, onPageReady])

  const visibleLists = useMemo(() => {
    if (!blockedByUsers.length) {
      return lists
    }

    const blockedSet = new Set(blockedByUsers)
    return lists.filter((list) => !blockedSet.has(list.userId))
  }, [lists, blockedByUsers])

  const sortedLists = useMemo(() => {
    const nextLists = [...visibleLists]

    if (activeFilter === 'recent') {
      return nextLists.sort((a, b) => getListDateValue(b) - getListDateValue(a))
    }

    //Para 'guia de lectura', primero filtro por ese criterio, y luego ordeno por popularidad y fecha para destacar las guías más valoradas y recientes.
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

    //Para 'popular' y 'saved', ordeno por popularidad, luego por fecha, y finalmente por nombre para romper empates.
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
  }, [activeFilter, visibleLists])

  //Filtrar por término de búsqueda
  const filteredLists = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase()

    if (!normalizedSearchTerm) {
      return sortedLists
    }

    return sortedLists.filter((list) =>
      String(list.nombre || '').toLowerCase().includes(normalizedSearchTerm),
    )
  }, [searchTerm, sortedLists])

  const pagedLists = useMemo(
    () => filteredLists.slice(0, visibleCount),
    [filteredLists, visibleCount],
  )

  const hasMoreResults = filteredLists.length > visibleCount

  useEffect(() => {
    setVisibleCount(15)
  }, [searchTerm, activeFilter])

  if (loading) {
    return (
      <main className="app-shell thematic-lists-page loading">
        <section className="app-card loading-card">
          <p className="status-message">Cargando listas temáticas...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell thematic-lists-page">
      <section className="app-card user-list-page">
        <header>
          <h1>Listas temáticas</h1>
          <p className="lead">
            Explora guías de lectura y listas destacadas creadas por la comunidad.
          </p>
        </header>

        {error ? <p className="form-message error">{error}</p> : null}

        <div className="thematic-lists-controls">
          <Button
            className="primary-button"
            onClick={onCreateList}
            type="button"
            variant="primary"
          >
            Crear lista temática
          </Button>

          {authUser?.uid && (
            <Button
              className="secondary-button"
              onClick={onOpenMyLists}
              type="button"
              variant="secondary"
            >
              Mis listas temáticas
            </Button>
          )}
        </div>

        <div className="thematic-search-bar">
          <label className="thematic-search-label" htmlFor="thematic-list-search">
            Buscar por nombre
          </label>
          <input
            id="thematic-list-search"
            className="thematic-search-input"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(sanitizeForbiddenInputChars(event.target.value))}
            placeholder="Escribe parte del nombre de la lista"
          />
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
            {LIST_FILTERS.map((filter) => {
              if (filter.id === 'saved' && !authUser?.uid) {
                return null
              }
              return (
                <option key={filter.id} value={filter.id}>
                  {filter.label}
                </option>
              )
            })}
          </select>
        </div>

        {filteredLists.length === 0 ? (
          <p className="status-message-black">
            {searchTerm.trim()
              ? 'No se encontraron coincidencias con ese nombre'
              : activeFilter === 'reading-guide'
                ? 'No hay guias de lectura disponibles por ahora'
                : activeFilter === 'saved'
                  ? 'Aun no has guardado ninguna lista'
                  : 'No hay listas tematicas disponibles por ahora'}
          </p>
        ) : (
          <>
            <div className="thematic-lists-grid">
              {pagedLists.map((list) => (
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
                    <p className="thematic-list-creator" style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '8px' }}>
                      Por: {creatorProfiles[list.userId] || list.userId}
                    </p>
                    <p>{list.descripcion || 'Sin descripción'}</p>
                    <div className="thematic-list-meta">
                      {list.esGuiaDeLectura ? <span>📖 Guía de lectura</span> : null}
                      <span>{list.cantidadLikes} me gusta</span>
                      <span>{list.cantidadComentarios} comentarios</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="thematic-results-footer">
              {hasMoreResults ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setVisibleCount((current) => current + 15)}
                >
                  Mostrar 15 más
                </button>
              ) : (
                <p className="status-message-black">No hay más listas para mostrar</p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default ThematicListsPage
