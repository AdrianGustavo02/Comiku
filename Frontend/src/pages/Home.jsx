import { useEffect, useState } from 'react'
import Navbar from '../Components/Navbar'
import { logout, subscribeToAuthChanges } from '../firebase/auth'
import { getAllComics } from '../firebase/comics'
import { deleteCurrentAccountData } from '../firebase/user'
import AuthPage from './AuthPage'
import ComicDetailPage from './ComicDetailPage'
import CreateComicPage from './CreateComicPage'
import CreateComicVolumesPage from './CreateComicVolumesPage'
import LibraryPage from './LibraryPage'
import ProfilePage from './ProfilePage'
import VolumeDetailPage from './VolumeDetailPage'
import WishlistPage from './WishlistPage'
import '../styles/Home.css'

function parseRoute(pathname) {
  const volumeMatch = pathname.match(/^\/comic\/([^/]+)\/tomo\/([^/]+)$/)

  if (volumeMatch) {
    return {
      page: 'volume-detail',
      comicId: decodeURIComponent(volumeMatch[1]),
      volumeId: decodeURIComponent(volumeMatch[2]),
    }
  }

  const comicMatch = pathname.match(/^\/comic\/([^/]+)$/)

  if (comicMatch) {
    return {
      page: 'comic-detail',
      comicId: decodeURIComponent(comicMatch[1]),
      volumeId: '',
    }
  }

  if (pathname === '/perfil') {
    return { page: 'profile', comicId: '', volumeId: '' }
  }

  if (pathname === '/crear-comic') {
    return { page: 'create-comic', comicId: '', volumeId: '' }
  }

  if (pathname === '/crear-comic/tomos') {
    return { page: 'create-comic-volumes', comicId: '', volumeId: '' }
  }

  if (pathname === '/biblioteca') {
    return { page: 'library', comicId: '', volumeId: '' }
  }

  if (pathname === '/deseados') {
    return { page: 'wishlist', comicId: '', volumeId: '' }
  }

  return { page: 'home', comicId: '', volumeId: '' }
}

function Home() {
  const initialRoute = parseRoute(window.location.pathname)

  const [authLoading, setAuthLoading] = useState(true)
  const [authUser, setAuthUser] = useState(null)
  const [activePage, setActivePage] = useState(initialRoute.page)
  const [activeComicId, setActiveComicId] = useState(initialRoute.comicId)
  const [activeVolumeId, setActiveVolumeId] = useState(initialRoute.volumeId)
  const [activeComicDraft, setActiveComicDraft] = useState(null)
  const [searchableComics, setSearchableComics] = useState([])
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  const goToHome = () => {
    window.history.replaceState({}, '', '/')
    setActivePage('home')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToProfile = () => {
    window.history.pushState({}, '', '/perfil')
    setActivePage('profile')
  }

  const goToCreateComic = () => {
    window.history.pushState({}, '', '/crear-comic')
    setActivePage('create-comic')
  }

  const goToCreateComicVolumes = () => {
    window.history.pushState({}, '', '/crear-comic/tomos')
    setActivePage('create-comic-volumes')
  }

  const goToLibrary = () => {
    window.history.pushState({}, '', '/biblioteca')
    setActivePage('library')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToWishlist = () => {
    window.history.pushState({}, '', '/deseados')
    setActivePage('wishlist')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToComicDetail = (comicId) => {
    window.history.pushState({}, '', `/comic/${encodeURIComponent(comicId)}`)
    setActivePage('comic-detail')
    setActiveComicId(comicId)
    setActiveVolumeId('')
  }

  const goToVolumeDetail = ({ comicId, volumeId }) => {
    window.history.pushState(
      {},
      '',
      `/comic/${encodeURIComponent(comicId)}/tomo/${encodeURIComponent(volumeId)}`,
    )
    setActivePage('volume-detail')
    setActiveComicId(comicId)
    setActiveVolumeId(volumeId)
  }

  const handleAuthenticated = ({ user, notice = '' }) => {
    setAuthUser(user)
    setActivePage('home')
    setAuthError('')
    setAuthNotice(notice)
    goToHome()
  }

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setAuthUser(user)
      setAuthLoading(false)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname)
      setActivePage(route.page)
      setActiveComicId(route.comicId)
      setActiveVolumeId(route.volumeId)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSearchableComics() {
      if (!authUser) {
        setSearchableComics([])
        return
      }

      try {
        const comics = await getAllComics()

        if (!cancelled) {
          setSearchableComics(comics)
        }
      } catch {
        if (!cancelled) {
          setSearchableComics([])
        }
      }
    }

    loadSearchableComics()

    return () => {
      cancelled = true
    }
  }, [authUser])

  const handleLogout = async () => {
    setAuthError('')
    setAuthNotice('')

    try {
      await logout()
      setAuthUser(null)
      setActivePage('home')
      setActiveComicDraft(null)
    } catch {
      setAuthError('No fue posible cerrar sesión.')
    }
  }

  const handleDeleteAccount = async () => {
    if (!authUser) {
      throw new Error('No hay una sesión activa para eliminar.')
    }

    setAuthError('')
    setAuthNotice('')

    try {
      setDeletingAccount(true)
      const idToken = await authUser.getIdToken(true)
      await deleteCurrentAccountData({ idToken })

      setAuthUser(null)
      setActivePage('home')
      setActiveComicDraft(null)
      setAuthNotice('Tu cuenta y datos asociados fueron eliminados correctamente.')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar tu cuenta.'
      setAuthError(message)
      throw new Error(message)
    } finally {
      setDeletingAccount(false)
    }
  }

  const renderNavbar = () => (
    <Navbar
      comics={searchableComics}
      onSelectComic={(comic) => goToComicDetail(comic.id)}
      onOpenHome={goToHome}
      onOpenLibrary={goToLibrary}
      onOpenWishlist={goToWishlist}
      activePage={activePage}
    />
  )

  if (authLoading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando sesión...</p>
        </section>
      </main>
    )
  }

  if (!authUser) {
    return (
      <AuthPage
        onAuthenticated={handleAuthenticated}
        authError={authError}
        authNotice={authNotice}
        onAuthError={setAuthError}
        onAuthNotice={setAuthNotice}
      />
    )
  }

  if (activePage === 'profile') {
    return (
      <>
        {renderNavbar()}
        <ProfilePage
          authUser={authUser}
          onBack={() => {
            setActivePage('home')
            goToHome()
          }}
          onDeleteAccount={handleDeleteAccount}
          isDeletingAccount={deletingAccount}
          globalError={authError}
        />
      </>
    )
  }

  if (activePage === 'create-comic') {
    return (
      <>
        {renderNavbar()}
        <CreateComicPage
          onBack={() => {
            setActivePage('home')
            setActiveComicDraft(null)
            goToHome()
          }}
          onComicCreated={(comicDraft) => {
            setAuthError('')
            setAuthNotice('Datos del comic listos. Ahora carga los tomos y finaliza.')
            setActiveComicDraft(comicDraft)
            setActivePage('create-comic-volumes')
            goToCreateComicVolumes()
          }}
        />
      </>
    )
  }

  if (activePage === 'create-comic-volumes') {
    return (
      <>
        {renderNavbar()}
        <CreateComicVolumesPage
          comicDraft={activeComicDraft}
          onBackToHome={() => {
            setActivePage('home')
            setActiveComicDraft(null)
            goToHome()
          }}
          onFinishCreation={(volumeCount) => {
            setAuthError('')
            setAuthNotice(
              `Comic y tomos creados correctamente. Tomos cargados: ${volumeCount}.`,
            )
            setActivePage('home')
            setActiveComicDraft(null)
            goToHome()
          }}
        />
      </>
    )
  }

  if (activePage === 'comic-detail') {
    return (
      <>
        {renderNavbar()}
        <ComicDetailPage
          comicId={activeComicId}
          onOpenVolume={(volume) => {
            goToVolumeDetail({ comicId: activeComicId, volumeId: volume.id })
          }}
        />
      </>
    )
  }

  if (activePage === 'volume-detail') {
    return (
      <>
        {renderNavbar()}
        <VolumeDetailPage
          comicId={activeComicId}
          volumeId={activeVolumeId}
          authUser={authUser}
        />
      </>
    )
  }

  if (activePage === 'library') {
    return (
      <>
        {renderNavbar()}
        <LibraryPage
          authUser={authUser}
          onOpenVolume={({ comicId, volumeId }) => {
            goToVolumeDetail({ comicId, volumeId })
          }}
        />
      </>
    )
  }

  if (activePage === 'wishlist') {
    return (
      <>
        {renderNavbar()}
        <WishlistPage
          authUser={authUser}
          onOpenVolume={({ comicId, volumeId }) => {
            goToVolumeDetail({ comicId, volumeId })
          }}
        />
      </>
    )
  }

  return (
    <>
      {renderNavbar()}
      <main className="app-shell">
        <section className="app-card">
          <div className="app-hero">
            <div>
              <p className="eyebrow">Comiku / Home</p>
              <h1>Inicio de Comiku</h1>
              <p className="lead">Ya iniciaste sesión. Esta es tu página principal.</p>
              <p className="session-user">Sesión activa: {authUser.email}</p>
            </div>

            <div className="hero-actions">
              <button
                className="create-button"
                onClick={() => {
                  setAuthError('')
                  setActiveComicDraft(null)
                  setActivePage('create-comic')
                  goToCreateComic()
                }}
                type="button"
              >
                Crear ahora
              </button>
              <button
                className="profile-button"
                onClick={() => {
                  setActivePage('profile')
                  goToProfile()
                }}
                type="button"
              >
                Mi perfil
              </button>
              <button className="logout-button" onClick={handleLogout} type="button">
                Cerrar sesión
              </button>
            </div>
          </div>

          {authNotice ? <p className="form-message success">{authNotice}</p> : null}
          {authError ? <p className="form-message error">{authError}</p> : null}

          <div className="content-grid">
            <section className="info-card">
              <h2>Tu cuenta está lista</h2>
              <p>
                A partir de aquí puedes empezar a construir el contenido principal de
                la aplicación para usuarios autenticados.
              </p>
            </section>
          </div>
        </section>
      </main>
    </>
  )
}

export default Home