import { useEffect, useRef, useState } from 'react'
import Navbar from '../Components/Navbar'
import { logout, subscribeToAuthChanges } from '../firebase/auth'
import { getAllComics, getComicVolumes } from '../firebase/comics'
import { deleteCurrentAccountData } from '../firebase/user'
import { getUserLibraryItems } from '../firebase/volumeLists'
import AuthPage from './AuthPage'
import ComicDetailPage from './ComicDetailPage'
import CreateComicPage from './CreateComicPage'
import CreateComicVolumesPage from './CreateComicVolumesPage'
import CreateThematicListPage from './CreateThematicListPage'
import LibraryPage from './LibraryPage'
import MyThematicListsPage from './MyThematicListsPage'
import ProfilePage from './ProfilePage'
import ThematicListsPage from './ThematicListsPage'
import ThematicListDetailPage from './ThematicListDetailPage'
import VolumeDetailPage from './VolumeDetailPage'
import WishlistPage from './WishlistPage'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import '../styles/ComicDetailPage.css'
import '../styles/Home.css'
import '../styles/VolumeCoverCard.css'

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

  if (pathname === '/listas-tematicas') {
    return { page: 'thematic-lists', comicId: '', volumeId: '' }
  }

  if (pathname === '/listas-tematicas/crear') {
    return { page: 'create-thematic-list', comicId: '', volumeId: '' }
  }

  if (pathname === '/listas-tematicas/mis-listas') {
    return { page: 'my-thematic-lists', comicId: '', volumeId: '' }
  }

  const editListMatch = pathname.match(/^\/listas-tematicas\/editar\/([^/]+)$/)

  if (editListMatch) {
    return {
      page: 'edit-thematic-list',
      comicId: decodeURIComponent(editListMatch[1]),
      volumeId: '',
    }
  }

  const listDetailMatch = pathname.match(/^\/listas-tematicas\/ver\/([^/]+)$/)

  if (listDetailMatch) {
    return {
      page: 'thematic-list-detail',
      comicId: decodeURIComponent(listDetailMatch[1]),
      volumeId: '',
    }
  }

  return { page: 'home', comicId: '', volumeId: '' }
}

function getDateTime(value) {
  if (!value) {
    return 0
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  return 0
}

function getVolumePublicationTime(volume) {
  if (typeof volume.fechaPublicacion === 'string' && /^\d{4}-\d{2}$/.test(volume.fechaPublicacion)) {
    const [year, month] = volume.fechaPublicacion.split('-').map(Number)
    return Date.UTC(year, month - 1, 1)
  }

  return 0
}

function getVolumeOrderValue(volume) {
  if (volume.tomoUnico) {
    return Number.MAX_SAFE_INTEGER
  }

  if (Number.isInteger(volume.numeroTomo)) {
    return volume.numeroTomo
  }

  return 0
}

function sortLatestLibraryVolumes(a, b) {
  const dateDiff = getDateTime(b.fechaAgregado) - getDateTime(a.fechaAgregado)

  if (dateDiff !== 0) {
    return dateDiff
  }

  const comicDiff = a.comicNombre.localeCompare(b.comicNombre, 'es')

  if (comicDiff !== 0) {
    return comicDiff
  }

  return getVolumeOrderValue(b) - getVolumeOrderValue(a)
}

function sortMissingLibraryVolumes(a, b) {
  const publicationDiff = getVolumePublicationTime(b) - getVolumePublicationTime(a)

  if (publicationDiff !== 0) {
    return publicationDiff
  }

  const orderDiff = getVolumeOrderValue(b) - getVolumeOrderValue(a)

  if (orderDiff !== 0) {
    return orderDiff
  }

  return a.comicNombre.localeCompare(b.comicNombre, 'es')
}

function getFeaturedRecommendationVolume(volumes) {
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

function getFeaturedRecommendationLabel(volume) {
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

function scrollCarousel(ref, direction) {
  if (!ref.current) {
    return
  }

  ref.current.scrollBy({
    left: direction === 'left' ? -220 : 220,
    behavior: 'smooth',
  })
}

function Home() {
  const initialRoute = parseRoute(window.location.pathname)
  const missingCarouselRef = useRef(null)
  const recentCarouselRef = useRef(null)
  const recommendationsCarouselRef = useRef(null)

  const [authLoading, setAuthLoading] = useState(true)
  const [authUser, setAuthUser] = useState(null)
  const [activePage, setActivePage] = useState(initialRoute.page)
  const [activeComicId, setActiveComicId] = useState(initialRoute.comicId)
  const [activeVolumeId, setActiveVolumeId] = useState(initialRoute.volumeId)
  const [activeComicDraft, setActiveComicDraft] = useState(null)
  const [searchableComics, setSearchableComics] = useState([])
  const [homeRefreshTick, setHomeRefreshTick] = useState(0)
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeError, setHomeError] = useState('')
  const [homeHasLibraryItems, setHomeHasLibraryItems] = useState(false)
  const [missingVolumes, setMissingVolumes] = useState([])
  const [recentVolumes, setRecentVolumes] = useState([])
  const [recommendedComics, setRecommendedComics] = useState([])
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  const goToHome = () => {
    window.history.replaceState({}, '', '/')
    setActivePage('home')
    setActiveComicId('')
    setActiveVolumeId('')
    setHomeLoading(true)
    setHomeError('')
    setHomeRefreshTick((currentTick) => currentTick + 1)
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

  const goToThematicLists = () => {
    window.history.pushState({}, '', '/listas-tematicas')
    setActivePage('thematic-lists')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToCreateThematicList = () => {
    window.history.pushState({}, '', '/listas-tematicas/crear')
    setActivePage('create-thematic-list')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToMyThematicLists = () => {
    window.history.pushState({}, '', '/listas-tematicas/mis-listas')
    setActivePage('my-thematic-lists')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToThematicListDetail = (listId) => {
    window.history.pushState({}, '', `/listas-tematicas/ver/${encodeURIComponent(listId)}`)
    setActivePage('thematic-list-detail')
    setActiveComicId(listId)
    setActiveVolumeId('')
  }

  const goToEditThematicList = (listId) => {
    window.history.pushState({}, '', `/listas-tematicas/editar/${encodeURIComponent(listId)}`)
    setActivePage('edit-thematic-list')
    setActiveComicId(listId)
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

  useEffect(() => {
    let cancelled = false

    async function loadHomeHighlights() {
      if (activePage !== 'home' || !authUser?.uid) {
        return
      }

      setHomeLoading(true)
      setHomeError('')

      try {
        const libraryItems = await getUserLibraryItems({ uid: authUser.uid })

        if (cancelled) {
          return
        }

        if (libraryItems.length === 0) {
          setHomeHasLibraryItems(false)
          setMissingVolumes([])
          setRecentVolumes([])
          setRecommendedComics([])
          return
        }

        setHomeHasLibraryItems(true)

        const libraryComicIds = new Set(libraryItems.map((item) => item.comicId))
        const libraryGenres = new Set(
          libraryItems.flatMap((item) => item.comic.generos),
        )

        const recentLibraryVolumes = libraryItems.flatMap((item) =>
          item.volumes.map((volume) => ({
            ...volume,
            comicId: item.comicId,
            comicNombre: item.comic.nombre,
          })),
        )

        let catalogComics = []

        try {
          catalogComics = await getAllComics()
        } catch {
          setHomeError('No fue posible cargar las recomendaciones por ahora.')
        }

        const volumeGroups = await Promise.all(
          libraryItems.map(async (item) => {
            try {
              const comicVolumes = await getComicVolumes(item.comicId)

              return {
                item,
                comicVolumes,
              }
            } catch {
              return {
                item,
                comicVolumes: [],
              }
            }
          }),
        )

        if (cancelled) {
          return
        }

        const nextMissingVolumes = volumeGroups
          .flatMap(({ item, comicVolumes }) => {
            const ownedVolumeIds = new Set(item.volumes.map((volume) => volume.id))

            return comicVolumes
              .filter((volume) => !ownedVolumeIds.has(volume.id))
              .map((volume) => ({
                ...volume,
                comicId: item.comicId,
                comicNombre: item.comic.nombre,
              }))
          })
          .sort(sortMissingLibraryVolumes)
          .slice(0, 25)

        const nextRecentVolumes = [...recentLibraryVolumes]
          .sort(sortLatestLibraryVolumes)
          .slice(0, 20)

        const recommendationCandidates = catalogComics
          .filter((comic) => !libraryComicIds.has(comic.id))
          .map((comic) => {
            const matchedGenres = comic.generos.filter((genre) => libraryGenres.has(genre))

            return {
              comic,
              matchedGenres,
              score: matchedGenres.length,
            }
          })
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score
            }

            const matchedGenresDiff = b.matchedGenres.length - a.matchedGenres.length

            if (matchedGenresDiff !== 0) {
              return matchedGenresDiff
            }

            return a.comic.nombre.localeCompare(b.comic.nombre, 'es')
          })
          .slice(0, 20)

        const nextRecommendations = await Promise.all(
          recommendationCandidates.map(async ({ comic, matchedGenres, score }) => {
            try {
              const comicVolumes = await getComicVolumes(comic.id)

              return {
                comicId: comic.id,
                comicNombre: comic.nombre,
                comicGeneros: comic.generos,
                matchedGenres,
                score,
                featuredVolume: getFeaturedRecommendationVolume(comicVolumes),
              }
            } catch {
              return {
                comicId: comic.id,
                comicNombre: comic.nombre,
                comicGeneros: comic.generos,
                matchedGenres,
                score,
                featuredVolume: null,
              }
            }
          }),
        )

        setMissingVolumes(nextMissingVolumes)
        setRecentVolumes(nextRecentVolumes)
        setRecommendedComics(nextRecommendations)

      } catch (requestError) {
        if (!cancelled) {
          setHomeError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el contenido de inicio.',
          )
          setHomeHasLibraryItems(false)
          setMissingVolumes([])
          setRecentVolumes([])
          setRecommendedComics([])
        }
      } finally {
        if (!cancelled) {
          setHomeLoading(false)
        }
      }
    }

    loadHomeHighlights()

    return () => {
      cancelled = true
    }
  }, [activePage, authUser?.uid, homeRefreshTick])

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
      onOpenThematicLists={goToThematicLists}
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

  if (activePage === 'home' && homeLoading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando inicio personalizado...</p>
        </section>
      </main>
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
          authUser={authUser}
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
          onOpenComic={(comicId) => {
            goToComicDetail(comicId)
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

    if (activePage === 'thematic-lists') {
    return (
      <>
        {renderNavbar()}
        <ThematicListsPage
          authUser={authUser}
          onOpenList={(listId) => goToThematicListDetail(listId)}
          onCreateList={goToCreateThematicList}
          onOpenMyLists={goToMyThematicLists}
          onOpenVolume={({ comicId, volumeId }) => {
            goToVolumeDetail({ comicId, volumeId })
          }}
        />
      </>
    )
  }

  if (activePage === 'create-thematic-list') {
    return (
      <>
        {renderNavbar()}
        <CreateThematicListPage
          authUser={authUser}
          listId={null}
          onBack={goToThematicLists}
          onFinishCreation={() => {
            goToThematicLists()
          }}
        />
      </>
    )
  }

  if (activePage === 'edit-thematic-list') {
    return (
      <>
        {renderNavbar()}
        <CreateThematicListPage
          authUser={authUser}
          listId={activeComicId}
          onBack={goToMyThematicLists}
          onFinishCreation={() => {
            goToMyThematicLists()
          }}
        />
      </>
    )
  }

  if (activePage === 'thematic-list-detail') {
    return (
      <>
        {renderNavbar()}
        <ThematicListDetailPage
          authUser={authUser}
          listId={activeComicId}
          onBack={goToThematicLists}
          onOpenVolume={({ comicId, volumeId }) => {
            goToVolumeDetail({ comicId, volumeId })
          }}
        />
      </>
    )
  }

    if (activePage === 'my-thematic-lists') {
    return (
      <>
        {renderNavbar()}
        <MyThematicListsPage
          authUser={authUser}
          onEditList={(listId) => goToEditThematicList(listId)}
          onBack={goToThematicLists}
          onOpenList={(listId) => goToThematicListDetail(listId)}
        />
      </>
    )
  }

  return (
    <>
      {renderNavbar()}
      <main className="app-shell">
        <section className="app-card home-dashboard-card">
          <div className="app-hero">
            <div>
              <p className="eyebrow">Comiku / Home</p>
              <h1>Inicio personalizado</h1>
              <p className="lead">
                Revisa tus faltantes, tus tomos más recientes y sugerencias basadas en
                los géneros que ya guardaste.
              </p>
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
          {homeError ? <p className="form-message error">{homeError}</p> : null}

          <div className="home-highlights">
            <section className="home-highlight-section">
              <div className="home-section-header">
                <div>
                  <p className="eyebrow">Comiku / Biblioteca</p>
                  <h2>Tomos que me faltan</h2>
                  <p className="home-section-lead">
                    Una guía rápida de los tomos que todavía no están en tu biblioteca.
                  </p>
                </div>
              </div>

              {!homeHasLibraryItems ? (
                <p className="home-empty-state">
                  Agrega comics a tu biblioteca para ver recomendaciones
                </p>
              ) : missingVolumes.length === 0 ? (
                <p className="home-empty-state">Estas al dia</p>
              ) : (
                <div className="volume-carousel">
                  <button
                    type="button"
                    className="volume-scroll-button volume-scroll-left"
                    onClick={() => scrollCarousel(missingCarouselRef, 'left')}
                    aria-label="Desplazar tomos faltantes hacia la izquierda"
                  >
                    ←
                  </button>

                  <div className="volume-cover-grid" ref={missingCarouselRef}>
                    {missingVolumes.map((volume) => (
                      <VolumeCoverCard
                        key={`${volume.comicId}-${volume.id}`}
                        volume={volume}
                        comicName={volume.comicNombre}
                        onOpen={(selectedVolume) =>
                          goToVolumeDetail({
                            comicId: volume.comicId,
                            volumeId: selectedVolume.id,
                          })
                        }
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="volume-scroll-button volume-scroll-right"
                    onClick={() => scrollCarousel(missingCarouselRef, 'right')}
                    aria-label="Desplazar tomos faltantes hacia la derecha"
                  >
                    →
                  </button>
                </div>
              )}
            </section>

            <section className="home-highlight-section">
              <div className="home-section-header">
                <div>
                  <p className="eyebrow">Comiku / Últimos agregados</p>
                  <h2>Mis ultimos tomos añadidos</h2>
                  <p className="home-section-lead">
                    Ordenados de izquierda a derecha con los más recientes primero.
                  </p>
                </div>
              </div>

              {!homeHasLibraryItems ? (
                <p className="home-empty-state">
                  Agrega comics a tu biblioteca para ver recomendaciones
                </p>
              ) : recentVolumes.length === 0 ? (
                <p className="home-empty-state">Estas al dia</p>
              ) : (
                <div className="volume-carousel">
                  <button
                    type="button"
                    className="volume-scroll-button volume-scroll-left"
                    onClick={() => scrollCarousel(recentCarouselRef, 'left')}
                    aria-label="Desplazar tomos recientes hacia la izquierda"
                  >
                    ←
                  </button>

                  <div className="volume-cover-grid" ref={recentCarouselRef}>
                    {recentVolumes.map((volume) => (
                      <VolumeCoverCard
                        key={`${volume.comicId}-${volume.id}`}
                        volume={volume}
                        comicName={volume.comicNombre}
                        onOpen={(selectedVolume) =>
                          goToVolumeDetail({
                            comicId: volume.comicId,
                            volumeId: selectedVolume.id,
                          })
                        }
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="volume-scroll-button volume-scroll-right"
                    onClick={() => scrollCarousel(recentCarouselRef, 'right')}
                    aria-label="Desplazar tomos recientes hacia la derecha"
                  >
                    →
                  </button>
                </div>
              )}
            </section>

            <section className="home-highlight-section">
              <div className="home-section-header">
                <div>
                  <p className="eyebrow">Comiku / Recomendaciones</p>
                  <h2>Te puede gustar...</h2>
                  <p className="home-section-lead">
                    Sugerencias creadas a partir de los géneros que dominan tu biblioteca.
                  </p>
                </div>
              </div>

              {!homeHasLibraryItems ? (
                <p className="home-empty-state">
                  Agrega comics a tu biblioteca para ver recomendaciones
                </p>
              ) : recommendedComics.length === 0 ? (
                <p className="home-empty-state">
                  No se encontraron recomendaciones para tus géneros actuales.
                </p>
              ) : (
                <div className="volume-carousel">
                  <button
                    type="button"
                    className="volume-scroll-button volume-scroll-left"
                    onClick={() => scrollCarousel(recommendationsCarouselRef, 'left')}
                    aria-label="Desplazar recomendaciones hacia la izquierda"
                  >
                    ←
                  </button>

                  <div className="volume-cover-grid" ref={recommendationsCarouselRef}>
                    {recommendedComics.map((comic) => {
                      const featuredVolume = comic.featuredVolume

                      return (
                        <button
                          key={comic.comicId}
                          type="button"
                          className="volume-cover-card home-recommendation-card"
                          onClick={() => goToComicDetail(comic.comicId)}
                        >
                          {featuredVolume?.portada?.dataUrl ? (
                            <img
                              src={featuredVolume.portada.dataUrl}
                              alt={`Portada de ${comic.comicNombre} - ${getFeaturedRecommendationLabel(featuredVolume)}`}
                            />
                          ) : (
                            <div className="volume-cover-placeholder">Sin portada</div>
                          )}

                          <div className="volume-cover-meta">
                            <span className="volume-cover-comic-name">{comic.comicNombre}</span>
                            <strong>{getFeaturedRecommendationLabel(featuredVolume)}</strong>
                            <span>
                              {comic.matchedGenres.length > 0
                                ? comic.matchedGenres.join(', ')
                                : 'Sugerencia general'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    className="volume-scroll-button volume-scroll-right"
                    onClick={() => scrollCarousel(recommendationsCarouselRef, 'right')}
                    aria-label="Desplazar recomendaciones hacia la derecha"
                  >
                    →
                  </button>
                </div>
              )}
            </section>
          </div>
        </section>
      </main>
    </>
  )
}

export default Home