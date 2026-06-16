import { useEffect, useRef, useState } from 'react'
import Navbar from '../Components/Navbar'
import Footer from '../Components/Footer'
import { logout, subscribeToAuthChanges } from '../firebase/auth'
import { getAllComics, getComicVolumes, getComicById } from '../firebase/comics'
import { deleteCurrentAccountData, getUserProfile } from '../firebase/user'
import { getUserLibraryItems } from '../firebase/volumeLists'
import AuthPage from './AuthPage'
import ComicDetailPage from './ComicDetailPage'
import CreateComicPage from './CreateComicPage'
import CreateComicVolumesPage from './CreateComicVolumesPage'
import CreateThematicListPage from './CreateThematicListPage'
import CreationsReviewPage from './CreationsReviewPage'
import CreationDetailPage from './CreationDetailPage'
import LibraryPage from './LibraryPage'
import MyThematicListsPage from './MyThematicListsPage'
import ProfilePage from './ProfilePage'
import ThematicListsPage from './ThematicListsPage'
import ThematicListDetailPage from './ThematicListDetailPage'
import VolumeDetailPage from './VolumeDetailPage'
import WishlistPage from './WishlistPage'
import ChatsPage from './ChatsPage'
import FriendsPage from './FriendsPage'
import BlockedUsersPage from './BlockedUsersPage'
import ReportsPage from './ReportsPage'
import ActivitiesPage from './ActivitiesPage'
import NotificationsPage from './NotificationsPage'
import ContactPage from './ContactPage'
import UserMessagesPage from './UserMessagesPage'
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

  const profileMatch = pathname.match(/^\/perfil\/([^/]+)$/)

  if (profileMatch) {
    return { page: 'profile', comicId: decodeURIComponent(profileMatch[1]), volumeId: '' }
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

  if (pathname === '/amigos') {
    return { page: 'friends', comicId: '', volumeId: '' }
  }

  if (pathname === '/usuarios-bloqueados') {
    return { page: 'blocked-users', comicId: '', volumeId: '' }
  }

  if (pathname === '/reportes') {
    return { page: 'reports', comicId: '', volumeId: '' }
  }

  if (pathname === '/contacto') {
    return { page: 'contacto', comicId: '', volumeId: '' }
  }

  if (pathname === '/actividades') {
    return { page: 'activities', comicId: '', volumeId: '' }
  }

  if (pathname === '/chats') {
    return { page: 'chats', comicId: '', volumeId: '' }
  }

  const activityMatch = pathname.match(/^\/actividades\/([^/]+)$/) 
  if (activityMatch) {
    return { page: 'activities', comicId: decodeURIComponent(activityMatch[1]), volumeId: '' }
  }

  if (pathname === '/notificaciones') {
    return { page: 'notifications', comicId: '', volumeId: '' }
  }

  const creationsListMatch = pathname.match(/^\/admin\/creations$/)

  if (creationsListMatch) {
    return { page: 'creations-review', comicId: '', volumeId: '' }
  }

  const creationDetailMatch = pathname.match(/^\/admin\/creations\/([^/]+)$/)

  if (creationDetailMatch) {
    return { page: 'creation-detail', comicId: decodeURIComponent(creationDetailMatch[1]), volumeId: '' }
  }

  if (pathname === '/mensajes-usuarios') {
    return { page: 'mensajes-usuarios', comicId: '', volumeId: '' }
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

function toSortableText(value) {
  return String(value ?? '').toLowerCase().trim()
}

function sortLatestLibraryVolumes(a, b) {
  const dateDiff = getDateTime(b.fechaAgregado) - getDateTime(a.fechaAgregado)

  if (dateDiff !== 0) {
    return dateDiff
  }

  const comicDiff = toSortableText(a.comicNombre).localeCompare(toSortableText(b.comicNombre), 'es')

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

  return toSortableText(a.comicNombre).localeCompare(toSortableText(b.comicNombre), 'es')
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
  const [createVolumesFromDetail, setCreateVolumesFromDetail] = useState(false)
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
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [currentUserProfile, setCurrentUserProfile] = useState(null)
  const [activeHeroSlide, setActiveHeroSlide] = useState(0)
  const [isNavHidden, setIsNavHidden] = useState(false)

  const handlePageReady = () => {
    setIsNavHidden(false)
  }

  // Safety fallback: if pages don't call `onPageReady()` (navegación muy rápida
  // o rutas sin carga asíncrona), mostramos el navbar automáticamente tras 800ms.
  useEffect(() => {
    if (!isNavHidden) return undefined

    const id = window.setTimeout(() => setIsNavHidden(false), 800)
    return () => window.clearTimeout(id)
  }, [isNavHidden])

  function normalizeRouteValue(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  const goToHome = () => {
    setIsNavHidden(true)
    window.history.replaceState({}, '', '/')
    setActivePage('home')
    setActiveComicId('')
    setActiveVolumeId('')
    setHomeLoading(true)
    setHomeError('')
    setHomeRefreshTick((currentTick) => currentTick + 1)
  }

  const goToProfile = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/perfil')
    setActivePage('profile')
  }

  const goToProfileByUid = (uid) => {
    setIsNavHidden(true)
    const safeUid = normalizeRouteValue(uid)

    window.history.pushState({}, '', `/perfil/${encodeURIComponent(safeUid)}`)
    setActivePage('profile')
    setActiveComicId(safeUid)
  }

  const goToFriends = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/amigos')
    setActivePage('friends')
    setActiveComicId('')
  }

  const goToBlockedUsers = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/usuarios-bloqueados')
    setActivePage('blocked-users')
    setActiveComicId('')
  }

  const goToReports = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/reportes')
    setActivePage('reports')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToCreationsReview = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/admin/creations')
    setActivePage('creations-review')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToContacto = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/contacto')
    setActivePage('contacto')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToMensajesUsuarios = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/mensajes-usuarios')
    setActivePage('mensajes-usuarios')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToActivities = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/actividades')
    setActivePage('activities')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToNotifications = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/notificaciones')
    setActivePage('notifications')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToCreateComic = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/crear-comic')
    setActivePage('create-comic')
  }

  const goToCreateComicVolumes = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/crear-comic/tomos')
    setActivePage('create-comic-volumes')
  }

  useEffect(() => {
    if (activePage !== 'home') {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setActiveHeroSlide((currentSlide) => (currentSlide + 1) % 2)
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [activePage])

  useEffect(() => {
    if (!authNotice) {
      return undefined
    }

    if (activePage !== 'home' && activePage !== 'comic-detail') {
      setAuthNotice('')
      return undefined
    }

    const noticeTimeoutId = window.setTimeout(() => {
      setAuthNotice('')
    }, 12000)

    return () => {
      window.clearTimeout(noticeTimeoutId)
    }
  }, [authNotice, activePage])

  // Navbar visibility is controlled by pages via `onPageReady()`.

  const homeHeroSlides = [
    {
      image: '/home-carousel/bienvenida-comiku.jpg',
      eyebrow: 'Bienvenido a Comiku',
      title: 'Descubre, organiza y comparte comics y tomos',
      description:
        'Comiku es una plataforma pensada para explorar comics, guardar tomos en tu biblioteca, crear listas temáticas y seguir de cerca las novedades de tu colección.',
      actionLabel: '',
      actionHandler: null,
    },
    {
      image: '/home-carousel/crear-comic.jpg',
      eyebrow: 'Ayuda a crecer la plataforma',
      title: 'Si no encuentras un comic, puedes crearlo',
      description:
        'Cuando un comic o tomo no existe todavía, puedes registrarlo para ayudar a que toda la comunidad complete el catálogo.',
      actionLabel: 'Crear comic',
      actionHandler: goToCreateComic,
    },
  ]

  const [activeLibraryUid, setActiveLibraryUid] = useState('')
  const [activeLibraryNick, setActiveLibraryNick] = useState('')

  const goToLibrary = (uid, nick) => {
    setIsNavHidden(true)
    const safeUid = normalizeRouteValue(uid)
    const safeNick = normalizeRouteValue(nick)
    const path = safeUid ? `/biblioteca?uid=${encodeURIComponent(safeUid)}` : '/biblioteca'
    window.history.pushState({}, '', path)
    setActivePage('library')
    setActiveComicId('')
    setActiveVolumeId('')
    setActiveLibraryUid(safeUid)
    setActiveLibraryNick(safeNick)
  }

  const goToWishlist = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/deseados')
    setActivePage('wishlist')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToThematicLists = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/listas-tematicas')
    setActivePage('thematic-lists')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToCreateThematicList = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/listas-tematicas/crear')
    setActivePage('create-thematic-list')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToMyThematicLists = () => {
    setIsNavHidden(true)
    window.history.pushState({}, '', '/listas-tematicas/mis-listas')
    setActivePage('my-thematic-lists')
    setActiveComicId('')
    setActiveVolumeId('')
  }

  const goToThematicListDetail = (listId) => {
    setIsNavHidden(true)
    window.history.pushState({}, '', `/listas-tematicas/ver/${encodeURIComponent(listId)}`)
    setActivePage('thematic-list-detail')
    setActiveComicId(listId)
    setActiveVolumeId('')
  }

  const goToEditComic = (comicId) => {
    setIsNavHidden(true)
    window.history.pushState({}, '', `/comic/editar/${encodeURIComponent(comicId)}`)
    setActivePage('edit-comic')
    setActiveComicId(comicId)
    setActiveVolumeId('')
  }

  const goToEditVolume = ({ comicId, volumeId }) => {
    setIsNavHidden(true)
    window.history.pushState(
      {},
      '',
      `/comic/${encodeURIComponent(comicId)}/tomo/editar/${encodeURIComponent(volumeId)}`,
    )
    setActivePage('edit-volume')
    setActiveComicId(comicId)
    setActiveVolumeId(volumeId)
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

  const handleAuthenticated = ({ user, profile = null, notice = '' }) => {
    setAuthUser(user)
    if (profile && typeof profile === 'object') {
      setCurrentUserRole(profile.rol || '')
      setCurrentUserProfile(profile)
    }
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
    let cancelled = false

    const PROFILE_RETRY_ATTEMPTS = 5
    const PROFILE_RETRY_DELAY_MS = 250

    async function wait(ms) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, ms)
      })
    }

    async function loadCurrentUserProfile() {
      if (!authUser?.uid) {
        setCurrentUserRole(null)
        setCurrentUserProfile(null)
        return
      }

      try {
        let profile = null

        for (let attempt = 0; attempt < PROFILE_RETRY_ATTEMPTS; attempt += 1) {
          profile = await getUserProfile(authUser.uid)

          if (profile || cancelled) {
            break
          }

          await wait(PROFILE_RETRY_DELAY_MS)
        }

        if (!cancelled) {
          setCurrentUserRole(profile?.rol || '')
          setCurrentUserProfile(profile)
        }
      } catch {
        if (!cancelled) {
          setCurrentUserRole('')
          setCurrentUserProfile(null)
        }
      }
    }

    loadCurrentUserProfile()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

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

            return toSortableText(a.comic.nombre).localeCompare(toSortableText(b.comic.nombre), 'es')
          })
          .slice(0, 20)

        const nextRecommendations = await Promise.all(
          recommendationCandidates.map(async ({ comic, matchedGenres, score }) => {
            try {
              const comicVolumes = await getComicVolumes(comic.id)

              return {
                comicId: comic.id,
                comicNombre: comic.nombre,
                comicAutores: comic.autores || [],
                comicGeneros: comic.generos,
                matchedGenres,
                score,
                featuredVolume: getFeaturedRecommendationVolume(comicVolumes),
              }
            } catch {
              return {
                comicId: comic.id,
                comicNombre: comic.nombre,
                comicAutores: comic.autores || [],
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

  const renderNavbar = () => {
    if (isNavHidden) return null
    try {
      return (
        <Navbar
          comics={searchableComics || []}
          onSelectComic={(comic) => goToComicDetail(comic.id)}
          onOpenHome={goToHome}
          onOpenLibrary={goToLibrary}
          onOpenWishlist={goToWishlist}
          onOpenThematicLists={goToThematicLists}
          onOpenChats={() => {
            window.history.pushState({}, '', '/chats')
            setActivePage('chats')
            setActiveComicId('')
          }}
          onOpenReports={goToReports}
          onOpenMensajesUsuarios={goToMensajesUsuarios}
          onOpenActivities={goToActivities}
          onOpenNotifications={goToNotifications}
          onOpenCreationsReview={goToCreationsReview}
          onOpenMyProfile={goToProfile}
          activePage={activePage}
          currentUserRole={currentUserRole}
          currentUserProfile={currentUserProfile}
        />
      )
    } catch (error) {

      console.error('Error rendering navbar:', error)
      return null
    }
  }

  const renderWithFooter = (content, includeFooter = true) => (
    <>
      {renderNavbar()}
      {content}
      {includeFooter && !isNavHidden ? <Footer onOpenContacto={goToContacto} /> : null}
    </>
  )

  if (authLoading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">
            {activePage === 'creations-review' ? 'Cargando creaciones...' : 'Cargando sesión...'}
          </p>
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
          <p className="status-message">Cargando inicio...</p>
        </section>
      </main>
    )
  }

  if (activePage === 'profile') {
    return renderWithFooter(
      <ProfilePage
          authUser={authUser}
          onLogout={handleLogout}
          onBack={() => {
            setActivePage('home')
            goToHome()
          }}
          onUserBlocked={({ nick }) => {
            const safeNick = String(nick || '').trim()
            setAuthError('')
            setAuthNotice(
              safeNick
                ? `Bloqueaste a ${safeNick} correctamente.`
                : 'Usuario bloqueado correctamente.',
            )
            goToHome()
          }}
          onAccountDeleted={({ message }) => {
            setAuthError('')
            setAuthNotice(message || 'Cuenta eliminada correctamente.')
            goToHome()
          }}
          profileUid={typeof activeComicId === 'string' && activeComicId ? activeComicId : undefined}
          onOpenComic={goToComicDetail}
          onOpenLibrary={goToLibrary}
          activeLibraryUid={typeof activeLibraryUid === 'string' && activeLibraryUid ? activeLibraryUid : undefined}
          activeLibraryNick={typeof activeLibraryNick === 'string' && activeLibraryNick ? activeLibraryNick : undefined}
          onDeleteAccount={handleDeleteAccount}
          isDeletingAccount={deletingAccount}
          globalError={authError}
          onGoToBlockedUsers={goToBlockedUsers}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'chats') {
    return renderWithFooter(
      <ChatsPage
          authUser={authUser}
          onOpenProfile={(uid) => goToProfileByUid(uid)}
          onOpenFriends={goToFriends}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'friends') {
    return renderWithFooter(
      <FriendsPage
          authUser={authUser}
          onOpenProfile={(uid) => goToProfileByUid(uid)}
          onBack={() => {
            setActivePage('chats')
            window.history.pushState({}, '', '/chats')
          }}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'blocked-users') {
    return renderWithFooter(
      <BlockedUsersPage
          authUser={authUser}
          onBack={() => {
            setActivePage('profile')
            setActiveComicId('')
            goToProfile()
          }}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'reports') {
    return renderWithFooter(<ReportsPage authUser={authUser} currentUserRole={currentUserRole} />)
  }

  if (activePage === 'activities') {
    return renderWithFooter(
      <ActivitiesPage
          authUser={authUser}
          selectedActivityId={activeComicId || undefined}
          onBack={() => {
            setActivePage('home')
            goToHome()
          }}
          onOpenVolume={({ comicId, volumeId }) => {
            goToVolumeDetail({ comicId, volumeId })
          }}
          onOpenThematicList={(listId) => {
            goToThematicListDetail(listId)
          }}
          onOpenProfile={(uid) => goToProfileByUid(uid)}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'notifications') {
    return renderWithFooter(<NotificationsPage authUser={authUser} onPageReady={handlePageReady} />, false)
  }

  if (activePage === 'contacto') {
    return renderWithFooter(
      <ContactPage
          authUser={authUser}
          onBack={() => {
            setActivePage('home')
            goToHome()
          }}
          onPageReady={handlePageReady}
        />
    , false)
  }

  if (activePage === 'mensajes-usuarios') {
    return renderWithFooter(
      <UserMessagesPage
          onBack={() => {
            setActivePage('home')
            goToHome()
          }}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'create-comic') {
    return renderWithFooter(
      <CreateComicPage
          onBack={() => {
            setActivePage('home')
            setActiveComicDraft(null)
            goToHome()
          }}
          onComicCreated={(comicDraft) => {
            setAuthError('')
            setActiveComicDraft(comicDraft)
            setActivePage('create-comic-volumes')
            goToCreateComicVolumes()
          }}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'create-comic-volumes') {
    return renderWithFooter(
      <CreateComicVolumesPage
          comicDraft={createVolumesFromDetail ? null : activeComicDraft}
          comicId={createVolumesFromDetail ? activeComicId : ''}
          onBackToHome={() => {
            setActivePage('home')
            setActiveComicDraft(null)
            setCreateVolumesFromDetail(false)
            goToHome()
          }}
          initialNotice={createVolumesFromDetail ? '' : (activeComicDraft ? 'Datos del comic listos. Ahora carga los tomos y finaliza.' : '')}
          showComicMetadata={createVolumesFromDetail}
          onCancel={() => {
            setCreateVolumesFromDetail(false)
            setActivePage('comic-detail')
            goToComicDetail(activeComicId)
          }}
          onFinishCreation={(volumeCount, pending) => {
            setAuthError('')
            setAuthNotice(
              createVolumesFromDetail
                ? `Tomos agregados correctamente. Tomos cargados: ${volumeCount}.${pending ? ' Enviado para revisión por un administrador.' : ''}`
                : `Comic y tomos creados correctamente. Tomos cargados: ${volumeCount}.${pending ? ' Enviado para revisión por un administrador.' : ''}`,
            )
            setActivePage(createVolumesFromDetail ? 'comic-detail' : 'home')
            setActiveComicDraft(null)
            setCreateVolumesFromDetail(false)
            if (createVolumesFromDetail) {
              goToComicDetail(activeComicId)
              window.scrollTo({ top: 0, behavior: 'auto' })
            } else {
              goToHome()
            }
          }}
          onPageReady={handlePageReady}
        />
    )
  }

  if (activePage === 'edit-comic') {
    return renderWithFooter(
      <CreateComicPage
        onBack={() => {
          setActivePage('home')
          setActiveComicDraft(null)
          goToHome()
        }}
        comicId={activeComicId}
        onComicUpdated={() => {
          setAuthError('')
          setAuthNotice('Comic actualizado correctamente.')
          setActivePage('comic-detail')
          goToComicDetail(activeComicId)
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'edit-volume') {
    return renderWithFooter(
      <CreateComicVolumesPage
        comicId={activeComicId}
        volumeId={activeVolumeId}
        onBackToHome={() => {
          setActivePage('home')
          goToHome()
        }}
        onVolumeUpdated={() => {
          setAuthError('')
          setAuthNotice('Tomo actualizado correctamente.')
          setActivePage('volume-detail')
          goToVolumeDetail({ comicId: activeComicId, volumeId: activeVolumeId })
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'comic-detail') {
    return renderWithFooter(
      <ComicDetailPage
        authUser={authUser}
        comicId={activeComicId}
        globalNotice={authNotice}
        globalError={authError}
        onOpenVolume={(volume) => {
          goToVolumeDetail({ comicId: activeComicId, volumeId: volume.id })
        }}
        onEditComic={(id) => goToEditComic(id)}
        onCreateVolume={() => {
          ;(async () => {
            try {
              const comic = await getComicById(activeComicId)
              setCreateVolumesFromDetail(true)
              setActiveComicDraft(comic)
              setActivePage('create-comic-volumes')
              goToCreateComicVolumes()
            } catch {
              setAuthError('No fue posible cargar los datos del cómic para crear tomos.')
            }
          })()
        }}
        onDeleteComic={() => {
          setAuthNotice('Comic eliminado correctamente.')
          goToLibrary()
        }}
        onOpenProfile={(uid) => goToProfileByUid(uid)}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'creations-review') {
    return renderWithFooter(
      <CreationsReviewPage
        onBack={() => {
          setActivePage('home')
          goToHome()
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'creation-detail') {
    return renderWithFooter(
      <CreationDetailPage
        creationId={activeComicId}
        onBack={() => {
          setActivePage('creations-review')
          goToCreationsReview()
        }}
        onApproved={() => {
          setAuthNotice('Creación aprobada correctamente.')
          setActivePage('creations-review')
          goToCreationsReview()
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'volume-detail') {
    return renderWithFooter(
      <VolumeDetailPage
        comicId={activeComicId}
        volumeId={activeVolumeId}
        authUser={authUser}
        onEditVolume={({ comicId, volumeId }) => goToEditVolume({ comicId, volumeId })}
        onDeleteVolume={({ comicId }) => {
          setAuthNotice('Tomo eliminado correctamente.')
          goToComicDetail(comicId)
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'library') {
    return renderWithFooter(
      <LibraryPage
        authUser={authUser}
        onOpenComic={(comicId) => {
          goToComicDetail(comicId)
        }}
        libraryUid={typeof activeLibraryUid === 'string' && activeLibraryUid ? activeLibraryUid : undefined}
        libraryOwnerNick={typeof activeLibraryNick === 'string' && activeLibraryNick ? activeLibraryNick : undefined}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'wishlist') {
    return renderWithFooter(
      <WishlistPage
        authUser={authUser}
        onOpenVolume={({ comicId, volumeId }) => {
          goToVolumeDetail({ comicId, volumeId })
        }}
        onPageReady={handlePageReady}
      />
    )
  }

    if (activePage === 'thematic-lists') {
    return renderWithFooter(
      <ThematicListsPage
        authUser={authUser}
        onOpenList={(listId) => goToThematicListDetail(listId)}
        onCreateList={goToCreateThematicList}
        onOpenMyLists={goToMyThematicLists}
        onOpenVolume={({ comicId, volumeId }) => {
          goToVolumeDetail({ comicId, volumeId })
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'create-thematic-list') {
    return renderWithFooter(
      <CreateThematicListPage
        authUser={authUser}
        listId={null}
        onBack={goToThematicLists}
        onFinishCreation={() => {
          goToThematicLists()
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'edit-thematic-list') {
    return renderWithFooter(
      <CreateThematicListPage
        authUser={authUser}
        listId={activeComicId}
        onBack={goToMyThematicLists}
        onFinishCreation={() => {
          goToMyThematicLists()
        }}
        onPageReady={handlePageReady}
      />
    )
  }

  if (activePage === 'thematic-list-detail') {
    return renderWithFooter(
      <ThematicListDetailPage
        authUser={authUser}
        listId={activeComicId}
        onBack={goToThematicLists}
        onOpenVolume={({ comicId, volumeId }) => {
          goToVolumeDetail({ comicId, volumeId })
        }}
        onDeleteList={() => {
          setAuthNotice('Lista temática eliminada correctamente.')
          goToThematicLists()
        }}
        onOpenProfile={(uid) => goToProfileByUid(uid)}
        onPageReady={handlePageReady}
      />
    )
  }

    if (activePage === 'my-thematic-lists') {
    return renderWithFooter(
      <MyThematicListsPage
        authUser={authUser}
        onEditList={(listId) => goToEditThematicList(listId)}
        onBack={goToThematicLists}
        onOpenList={(listId) => goToThematicListDetail(listId)}
        onPageReady={handlePageReady}
      />
    )
  }

  return (
    <>
      {renderNavbar()}
      <main className="app-shell">
        <section className="app-card home-dashboard-card">
          {authNotice ? <p className="form-message success">{authNotice}</p> : null}

          <div className="home-carousel" aria-roledescription="carousel" aria-label="Inicio de Comiku">
            <div className="home-carousel-track">
              {homeHeroSlides.map((slide, index) => (
                <article
                  key={slide.title}
                  className={`home-carousel-slide ${index === activeHeroSlide ? 'active' : ''}`}
                  style={{ backgroundImage: `url(${slide.image})` }}
                  aria-hidden={index !== activeHeroSlide}
                >
                  <div className="home-carousel-overlay" />
                  <div className="home-carousel-content">
                    <p className="eyebrow home-carousel-eyebrow">{slide.eyebrow}</p>
                    <h1>{slide.title}</h1>
                    <p className="lead">{slide.description}</p>
                    {slide.actionLabel ? (
                      <button className="create-button home-carousel-button" onClick={slide.actionHandler} type="button">
                        {slide.actionLabel}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="home-carousel-dots" aria-label="Seleccionar slide del carrusel">
              {homeHeroSlides.map((slide, index) => (
                <button
                  key={slide.title}
                  type="button"
                  className={`home-carousel-dot ${index === activeHeroSlide ? 'active' : ''}`}
                  onClick={() => setActiveHeroSlide(index)}
                  aria-label={`Ver slide ${index + 1}`}
                  aria-pressed={index === activeHeroSlide}
                />
              ))}
            </div>
          </div>
          {authError ? <p className="form-message error">{authError}</p> : null}
          {homeError ? <p className="form-message error">{homeError}</p> : null}

          <div className="home-highlights">
            <section className="home-highlight-section">
              <div className="home-section-header">
                <div>
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
                            <strong className="volume-cover-comic-name">{comic.comicNombre}</strong>
                            <span className="volume-cover-authors">
                              {Array.isArray(comic.comicAutores) && comic.comicAutores.length > 0
                                ? comic.comicAutores.join(', ')
                                : 'Autores desconocidos'}
                            </span>
                            <span className="volume-cover-genres">
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
      <Footer onOpenContacto={goToContacto} />
    </>
  )
}

export default Home