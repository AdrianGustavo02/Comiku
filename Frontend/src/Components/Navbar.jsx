import { useEffect, useMemo, useRef, useState } from 'react'
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import '../styles/Navbar.css'

function normalizeText(value) {
  return String(value ?? '').toLowerCase().trim()
}

function getSearchScore(name, query) {
  const safeName = String(name || '')

  if (name === query) {
    return 0
  }

  if (safeName.startsWith(query)) {
    return 1
  }

  const matchIndex = safeName.indexOf(query)

  if (matchIndex >= 0) {
    return 2 + matchIndex
  }

  return Number.POSITIVE_INFINITY
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 5.5h5.5a2 2 0 0 1 2 2V20H8a2 2 0 0 1-2-2V5.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M11.5 7.5H18a2 2 0 0 1 2 2V20h-6.5V7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 10h13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 13h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function WishlistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.53L12 21.35Z" fill="currentColor" />
    </svg>
  )
}

function ThematicListsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 12h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 17.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 6.5h1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 12h1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 17.5h1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16.5 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.75 19c.6-2.7 2.55-4.25 5.25-4.25S13.65 16.3 14.25 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.75 18.25c.42-1.9 1.8-3 3.75-3s3.33 1.1 3.75 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.8 8.5h2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.5 6.5 20 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.5 9 20.5 9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
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
  onOpenMyProfile,
  onOpenContacto,
  onOpenMensajesUsuarios,
  activePage,
  currentUserRole,
  currentUserProfile,
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobileAdminMenuOpen, setIsMobileAdminMenuOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
        setIsAdminMenuOpen(false)
        setIsMobileMenuOpen(false)
        setIsMobileAdminMenuOpen(false)
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
  const isAdminSectionActive = ['reports', 'creations-review', 'mensajes-usuarios'].includes(activePage)

  function handleMobileNavigate(action) {
    setIsMobileMenuOpen(false)
    setIsMobileAdminMenuOpen(false)
    if (typeof action === 'function') action()
  }

  return (
    <header className="navbar-shell">
      <div className="navbar-content" ref={containerRef}>
        <button
          type="button"
          className="navbar-logo-button navbar-logo-button-desktop"
          onClick={onOpenHome}
          aria-label="Ir a inicio"
          title="Ir a inicio"
        >
          <img className="navbar-logo-image" src="/icon.png" alt="Comiku" />
        </button>

        <div className="navbar-mobile-row">
          <button
            type="button"
            className={`navbar-link-button navbar-mobile-toggle ${isMobileMenuOpen ? 'active' : ''}`}
            onClick={() => setIsMobileMenuOpen((state) => !state)}
            aria-haspopup="menu"
            aria-expanded={isMobileMenuOpen}
            aria-label="Abrir menu de navegacion"
          >
            <span className="navbar-mobile-toggle-icon" aria-hidden="true">☰</span>
          </button>

          <button
            type="button"
            className="navbar-logo-button navbar-logo-button-mobile"
            onClick={() => handleMobileNavigate(onOpenHome)}
            aria-label="Ir a inicio"
            title="Ir a inicio"
          >
            <img className="navbar-logo-image" src="/icon.png" alt="Comiku" />
          </button>

          <div className="navbar-search-area navbar-search-area-mobile">
            <input
              id="comic-search-input-mobile"
              className="search-input"
              type="text"
              placeholder="Busca un comic por su nombre. Ejemplo: One Piece"
              aria-label="Buscar un comic por su nombre"
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
                  <li key={`mobile-${comic.id}`}>
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
        </div>

        {isMobileMenuOpen ? (
          <div className="navbar-mobile-menu" role="menu" aria-label="Navegacion movil">
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'home' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenHome)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 10.5 12 3l9 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5.5 9.75V21h13V9.75" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M10 21v-5h4v5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Inicio</span>
            </button>
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'library' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenLibrary)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true"><LibraryIcon /></span>
              <span>Biblioteca</span>
            </button>
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'wishlist' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenWishlist)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true"><WishlistIcon /></span>
              <span>Wishlist</span>
            </button>
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'thematic-lists' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenThematicLists)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true"><ThematicListsIcon /></span>
              <span>Listas tematicas</span>
            </button>
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'activities' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenActivities)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true"><ActivityIcon /></span>
              <span>Actividades</span>
            </button>
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'chats' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenChats)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 18.5L4 20V7.5C4 6.12 5.12 5 6.5 5h11C18.88 5 20 6.12 20 7.5v6c0 1.38-1.12 2.5-2.5 2.5H9.2L7 18.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M8.5 9.5h7M8.5 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <span>Chats</span>
            </button>
            <button type="button" className={`navbar-mobile-menu-item ${activePage === 'notifications' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenNotifications)}>
              <span className="navbar-mobile-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 18.5a2 2 0 1 1-4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M17 16H7.5c-.83 0-1.5-.67-1.5-1.5V11a6 6 0 1 1 12 0v3.5c0 .83-.67 1.5-1.5 1.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M12 4v1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <span>Notificaciones</span>
            </button>
            {onOpenMyProfile ? (
              <button type="button" className={`navbar-mobile-menu-item navbar-mobile-profile-item ${activePage === 'profile' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenMyProfile)}>
                <img
                  className="navbar-mobile-profile-avatar"
                  src={currentUserProfile?.fotoPerfil || defaultProfilePicture}
                  alt="Foto de perfil"
                />
                <span className="navbar-mobile-profile-text">{currentUserProfile?.nick || 'Mi perfil'}</span>
              </button>
            ) : null}

            {canSeeReports ? (
              <div className="navbar-mobile-admin-wrapper">
                <button
                  type="button"
                  className={`navbar-mobile-menu-item navbar-mobile-admin-toggle ${isAdminSectionActive ? 'active' : ''}`}
                  onClick={() => setIsMobileAdminMenuOpen((state) => !state)}
                  aria-haspopup="menu"
                  aria-expanded={isMobileAdminMenuOpen}
                >
                  <span>Administracion</span>
                  <span
                    className={`admin-menu-caret ${isMobileAdminMenuOpen ? 'open' : ''}`}
                    aria-hidden="true"
                  >
                    ▼
                  </span>
                </button>

                {isMobileAdminMenuOpen ? (
                  <div className="navbar-mobile-admin-dropdown" role="menu" aria-label="Administracion movil">
                    <button type="button" className={`navbar-mobile-menu-item navbar-mobile-admin-item ${activePage === 'creations-review' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenCreationsReview)}>Creaciones de comics/tomos</button>
                    <button type="button" className={`navbar-mobile-menu-item navbar-mobile-admin-item ${activePage === 'reports' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenReports)}>Reportes</button>
                    <button type="button" className={`navbar-mobile-menu-item navbar-mobile-admin-item ${activePage === 'mensajes-usuarios' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenMensajesUsuarios)}>Mensajes de usuarios</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!canSeeReports && onOpenContacto ? (
              <button type="button" className={`navbar-mobile-menu-item ${activePage === 'contacto' ? 'active' : ''}`} onClick={() => handleMobileNavigate(onOpenContacto)}>Contacto</button>
            ) : null}
          </div>
        ) : null}

        <div className="navbar-links">
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'home' ? 'active' : ''}`}
            onClick={onOpenHome}
          >
            <span className="navbar-home-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                <path d="M3 10.5 12 3l9 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 9.75V21h13V9.75" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M10 21v-5h4v5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'library' ? 'active' : ''}`}
            onClick={onOpenLibrary}
          >
            <span className="navbar-button-icon" aria-hidden="true"><LibraryIcon /></span>
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'wishlist' ? 'active' : ''}`}
            onClick={onOpenWishlist}
          >
            <span className="navbar-button-icon" aria-hidden="true"><WishlistIcon /></span>
          </button>
          <button
            type="button"
            className={`navbar-link-button ${activePage === 'thematic-lists' ? 'active' : ''}`}
            onClick={onOpenThematicLists}
          >
            <span className="navbar-button-icon" aria-hidden="true"><ThematicListsIcon /></span>
          </button>
            <button
            type="button"
            className={`navbar-link-button ${activePage === 'activities' ? 'active' : ''}`}
            onClick={onOpenActivities}
            >
            <span className="navbar-button-icon" aria-hidden="true"><ActivityIcon /></span>
          </button>
          <button
            type="button"
            className={`navbar-link-button navbar-icon-button ${activePage === 'chats' ? 'active' : ''}`}
            onClick={onOpenChats}
            aria-label="Chats"
            title="Chats"
          >
            <span className="navbar-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 18.5L4 20V7.5C4 6.12 5.12 5 6.5 5h11C18.88 5 20 6.12 20 7.5v6c0 1.38-1.12 2.5-2.5 2.5H9.2L7 18.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M8.5 9.5h7M8.5 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
          </button>

          <button
            type="button"
            className={`navbar-link-button navbar-icon-button ${activePage === 'notifications' ? 'active' : ''}`}
            onClick={onOpenNotifications}
            aria-label="Notificaciones"
            title="Notificaciones"
          >
            <span className="navbar-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 18.5a2 2 0 1 1-4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M17 16H7.5c-.83 0-1.5-.67-1.5-1.5V11a6 6 0 1 1 12 0v3.5c0 .83-.67 1.5-1.5 1.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M12 4v1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
          </button>
          {canSeeReports ? (
            <div className="admin-menu-wrapper">
              <button
                type="button"
                className={`navbar-link-button ${isAdminSectionActive ? 'active' : ''}`}
                onClick={() => setIsAdminMenuOpen((state) => !state)}
                aria-haspopup="menu"
                aria-expanded={isAdminMenuOpen}
              >
                <span>Administracion</span>
                <span
                  className={`admin-menu-caret ${isAdminMenuOpen ? 'open' : ''}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </button>

              {isAdminMenuOpen ? (
                <div className="admin-menu-dropdown" role="menu" aria-label="Administracion">
                  <button
                    type="button"
                    className={`admin-menu-item ${activePage === 'creations-review' ? 'active' : ''}`}
                    onClick={() => {
                      setIsAdminMenuOpen(false)
                      if (typeof onOpenCreationsReview === 'function') onOpenCreationsReview()
                    }}
                  >
                    Creaciones de comics/tomos
                  </button>
                  <button
                    type="button"
                    className={`admin-menu-item ${activePage === 'reports' ? 'active' : ''}`}
                    onClick={() => {
                      setIsAdminMenuOpen(false)
                      if (typeof onOpenReports === 'function') onOpenReports()
                    }}
                  >
                    Reportes
                  </button>
                  <button
                    type="button"
                    className={`admin-menu-item ${activePage === 'mensajes-usuarios' ? 'active' : ''}`}
                    onClick={() => {
                      setIsAdminMenuOpen(false)
                      if (typeof onOpenMensajesUsuarios === 'function') onOpenMensajesUsuarios()
                    }}
                  >
                    Mensajes de usuarios
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {onOpenMyProfile ? (
            <button
              type="button"
              className={`navbar-profile-button ${activePage === 'profile' ? 'active' : ''}`}
              onClick={onOpenMyProfile}
            >
              <img
                className="navbar-profile-avatar"
                src={currentUserProfile?.fotoPerfil || defaultProfilePicture}
                alt="Foto de perfil"
              />
              <span className="navbar-profile-text">{currentUserProfile?.nick || 'Mi perfil'}</span>
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
        </div>

        <div className="navbar-search-area">
          <input
            id="comic-search-input"
            className="search-input"
            type="text"
            placeholder="Busca un comic por su nombre. Ejemplo: One Piece"
            aria-label="Buscar un comic por su nombre"
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
      </div>
    </header>
  )
}

export default Navbar