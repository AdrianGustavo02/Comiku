import { useEffect, useMemo, useRef, useState } from 'react'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import '../styles/Navbar.css'

function normalizeText(value) {
  return (value || '').toLowerCase().trim()
}

function getSearchScore(name, query) {
  if (name === query) {
    return 0
  }

  if (name.startsWith(query)) {
    return 1
  }

  const matchIndex = name.indexOf(query)

  if (matchIndex >= 0) {
    return 2 + matchIndex
  }

  return Number.POSITIVE_INFINITY
}

function Navbar({
  comics,
  onSelectComic,
  onOpenHome,
  onOpenLibrary,
  onOpenWishlist,
  onOpenThematicLists,
  onOpenChats,
  onOpenActivities,
  onOpenNotifications,
  onOpenReports,
  onOpenCreationsReview,
  onOpenContacto,
  onOpenMensajesUsuarios,
  activePage,
  currentUserRole,
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const filteredComics = useMemo(() => {
    const normalizedQuery = normalizeText(query)

    if (!normalizedQuery) {
      return []
    }

    if (!Array.isArray(comics)) {
      return []
    }

    return comics
      .map((comic) => {
        const normalizedName = normalizeText(comic.nombre)

        return {
          comic,
          score: getSearchScore(normalizedName, normalizedQuery),
        }
      })
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => {
        if (a.score !== b.score) {
          return a.score - b.score
        }

        return a.comic.nombre.localeCompare(b.comic.nombre, 'es')
      })
      .map((entry) => entry.comic)
      .slice(0, 8)
  }, [comics, query])

  const hasTypedQuery = normalizeText(query).length > 0
  const canSeeReports = String(currentUserRole || '').toLowerCase().includes('admin')

  return (
    <header className="navbar-shell">
      <div className="navbar-content" ref={containerRef}>
        <div className="navbar-links">
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'home' ? 'active' : ''}`}
            onClick={onOpenHome}
          >
            Inicio
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'library' ? 'active' : ''}`}
            onClick={onOpenLibrary}
          >
            Biblioteca
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'wishlist' ? 'active' : ''}`}
            onClick={onOpenWishlist}
          >
            Lista de deseados
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'thematic-lists' ? 'active' : ''}`}
            onClick={onOpenThematicLists}
          >
            Listas temáticas
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'chats' ? 'active' : ''}`}
            onClick={onOpenChats}
          >
            Chats
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'activities' ? 'active' : ''}`}
            onClick={onOpenActivities}
          >
            Actividad
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'notifications' ? 'active' : ''}`}
            onClick={onOpenNotifications}
          >
            🔔 Notificaciones
          </button>
          {canSeeReports ? (
            <button
              type="button"
              className={`navbar-link-button ${activePage === 'reports' ? 'active' : ''}`}
              onClick={onOpenReports}
            >
              Reportes
            </button>
          ) : null}
          {canSeeReports ? (
            <button
              type="button"
              className={`navbar-link-button ${activePage === 'creations-review' ? 'active' : ''}`}
              onClick={() => {
                if (typeof onOpenCreationsReview === 'function') onOpenCreationsReview()
              }}
            >
              Creations
            </button>
          ) : null}
          {!canSeeReports && onOpenContacto ? (
            <button
              type="button"
              className={`navbar-link-button ${activePage === 'contacto' ? 'active' : ''}`}
              onClick={onOpenContacto}
            >
              Contacto
            </button>
          ) : null}
          {canSeeReports && onOpenMensajesUsuarios ? (
            <button
              type="button"
              className={`navbar-link-button ${activePage === 'mensajes-usuarios' ? 'active' : ''}`}
              onClick={onOpenMensajesUsuarios}
            >
              Mensajes de usuarios
            </button>
          ) : null}
        </div>

        <label className="search-label" htmlFor="comic-search-input">
          Buscar comic por nombre
        </label>
        <input
          id="comic-search-input"
          className="search-input"
          type="text"
          placeholder="Ejemplo: One Piece"
          value={query}
          onChange={(event) => {
            setQuery(sanitizeForbiddenInputChars(event.target.value))
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
        />

        {isOpen && filteredComics.length > 0 ? (
          <ul className="search-suggestion-list" role="listbox">
            {filteredComics.map((comic) => (
              <li key={comic.id}>
                <button
                  type="button"
                  className="search-suggestion-button"
                  onClick={() => {
                    setQuery(comic.nombre)
                    setIsOpen(false)
                    onSelectComic(comic)
                  }}
                >
                  <strong>{comic.nombre}</strong>
                  <span className="suggestion-meta">
                    {(comic.editorial || 'Sin editorial') + (comic.paisEditorial ? ` (${comic.paisEditorial})` : '')}
                    {' | '}
                    {(Array.isArray(comic.autores) && comic.autores.length > 0) ? comic.autores.join(', ') : 'Autores desconocidos'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {isOpen && hasTypedQuery && filteredComics.length === 0 ? (
          <p className="search-empty-state">No se encontraron comics con ese nombre.</p>
        ) : null}
      </div>
    </header>
  )
}

export default Navbar