import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getUserProfile,
  updateUserProfile,
  updateUserFeaturedComicIds,
  sendFriendRequest,
  cancelSentFriendRequest,
  areFriends,
  removeFriend,
  getFriendRequests,
  blockUser,
  isUserBlocked,
  setUserRole,
  deleteUserAccountByAdmin,
} from '../firebase/user'
import { createReport, hasPendingObjectReport, REPORT_REASON_OPTIONS_FOR_USER } from '../firebase/reports'
import {
  containsNumbers,
  sanitizeForbiddenInputChars,
  sanitizeNameInput,
} from '../constants/forbiddenInputCharacters'
import ImageCropperModal from '../Components/ImageCropperModal'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_PROFILE_PICTURE_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import '../styles/ProfilePage.css'
import FileInput from '../Components/FileInput'
import Button from '../Components/Button'
import { getUserLibraryItems } from '../firebase/volumeLists'

const MINIMUM_AGE = 18
function sanitizeText(input) {
  return sanitizeForbiddenInputChars(input).trim()
}

function isAdminRole(role) {
  return String(role || '').toLowerCase().includes('admin')
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return null
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(isoDate)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function getFeaturedLibraryVolume(volumes) {
  if (!Array.isArray(volumes) || volumes.length === 0) {
    return null
  }

  const sortedVolumes = [...volumes].sort((a, b) => {
    if (a.tomoUnico && !b.tomoUnico) return -1
    if (!a.tomoUnico && b.tomoUnico) return 1

    if (a.numeroTomo === null && b.numeroTomo === null) return 0
    if (a.numeroTomo === null) return 1
    if (b.numeroTomo === null) return -1

    return a.numeroTomo - b.numeroTomo
  })

  return (
    sortedVolumes.find((volume) => volume.numeroTomo === 1) ??
    sortedVolumes.find((volume) => volume.tomoUnico) ??
    sortedVolumes[0]
  )
}

function getFeaturedActionLabel({ isSelected, selectedCount }) {
  if (isSelected) {
    return 'Quitar destacado'
  }

  if (selectedCount >= 10) {
    return 'Límite alcanzado'
  }

  return 'Agregar destacado'
}

function ProfilePage({
  authUser,
  onLogout,
  onBack,
  onUserBlocked,
  onDeleteAccount,
  onAccountDeleted,
  isDeletingAccount,
  globalError,
  profileUid,
  onOpenComic,
  onOpenLibrary,
  onGoToBlockedUsers,
  onPageReady,
}) {
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [profileData, setProfileData] = useState(null)
  const [localDeleteError, setLocalDeleteError] = useState('')
  const [deleteModalStep, setDeleteModalStep] = useState(null)
  const [deleteTargetUid, setDeleteTargetUid] = useState('')
  const [deleteTargetNick, setDeleteTargetNick] = useState('')
  const [deleteConfirmNick, setDeleteConfirmNick] = useState('')
  const [processingDeleteAccount, setProcessingDeleteAccount] = useState(false)
  const [friendshipStatus, setFriendshipStatus] = useState('none')
  const [processingFriendship, setProcessingFriendship] = useState(false)
  const [isBlockedByProfileUser, setIsBlockedByProfileUser] = useState(false)
  const [isBlockingProfileUser, setIsBlockingProfileUser] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [processingBlock, setProcessingBlock] = useState(false)
  const [libraryItems, setLibraryItems] = useState([])
  const [editFeaturedComicIds, setEditFeaturedComicIds] = useState([])
  const [featuredComicSearch, setFeaturedComicSearch] = useState('')
  const [visibleFeaturedComicCount, setVisibleFeaturedComicCount] = useState(12)
  const isOwnProfile = !profileUid || profileUid === authUser?.uid

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      const uidToLoad = profileUid || authUser?.uid

      if (!uidToLoad) {
        setProfileData(null)
        setProfileLoading(false)
        return
      }

      try {
        setProfileLoading(true)
        setProfileError('')
        const data = await getUserProfile(uidToLoad)

        if (!cancelled) {
          setProfileData(data)
        }

        if (authUser?.uid && profileUid && profileUid !== authUser.uid) {
          const blockedByProfileUser = await isUserBlocked(authUser.uid, profileUid)
          const blockedByMe = await isUserBlocked(profileUid, authUser.uid)

          if (!cancelled) {
            setIsBlockedByProfileUser(blockedByProfileUser)
            setIsBlockingProfileUser(blockedByMe)
          }
        } else if (!cancelled) {
          setIsBlockedByProfileUser(false)
          setIsBlockingProfileUser(false)
        }
      } catch (error) {
        if (!cancelled) {
          setProfileError(
            error instanceof Error
              ? error.message
              : 'No fue posible obtener tu perfil.',
          )
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, onPageReady, profileUid])

  //Cargar el estado de amistad cuando se ve otro perfil.
  useEffect(() => {
    let cancelled = false

    async function loadFriendshipStatus() {
      if (isOwnProfile) {
        setFriendshipStatus('none')
        return
      }

      try {
        const isFriend = await areFriends(authUser.uid, profileUid)

        if (!cancelled) {
          if (isFriend) {
            setFriendshipStatus('friends')
          } else {
            //Verifico si hay solicitud pendiente.
            const requests = await getFriendRequests(profileUid)
            const hasRequest = requests.some((r) => r.senderUid === authUser.uid)

            if (hasRequest) {
              setFriendshipStatus('requested')
            } else {
              setFriendshipStatus('none')
            }
          }
        }
      } catch (error) {
        void error
        if (!cancelled) {
          setFriendshipStatus('none')
        }
      }
    }

    loadFriendshipStatus()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, isOwnProfile, profileUid])

  //Envio de solicitud de amistad.
  const handleSendFriendRequest = async () => {
    if (!profileUid) return

    try {
      setProcessingFriendship(true)
      await sendFriendRequest(authUser.uid, profileUid)
      setFriendshipStatus('requested')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'No fue posible enviar la solicitud.'
      )
    } finally {
      setProcessingFriendship(false)
    }
  }

  //Cancelar solicitud de amistad enviada.
  const handleCancelSentFriendRequest = async () => {
    if (!profileUid) return

    try {
      setProcessingFriendship(true)
      await cancelSentFriendRequest(authUser.uid, profileUid)
      setFriendshipStatus('none')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'No fue posible cancelar la solicitud.'
      )
    } finally {
      setProcessingFriendship(false)
    }
  }

  //Eliminacion de amigo.
  const handleRemoveFriend = async () => {
    if (!profileUid) return

    try {
      setProcessingFriendship(true)
      await removeFriend(authUser.uid, profileUid)
      setFriendshipStatus('none')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'No fue posible eliminar el amigo.'
      )
    } finally {
      setProcessingFriendship(false)
    }
  }

  //Bloqueo de usuario.
  const handleBlockUser = async () => {
    if (!profileUid) return

    try {
      setProcessingBlock(true)
      await blockUser(authUser.uid, profileUid)
      setIsBlockingProfileUser(true)
      setBlockModalOpen(false)
      if (typeof onUserBlocked === 'function') {
        onUserBlocked({ uid: profileUid, nick: profileData?.nick || '' })
      } else {
        setProfileNotice('Usuario bloqueado exitosamente.')
        onBack?.()
      }
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'No fue posible bloquear el usuario.'
      )
    } finally {
      setProcessingBlock(false)
    }
  }

  const handleDeleteClick = async () => {
    setLocalDeleteError('')
    setDeleteConfirmNick('')
    setDeleteTargetUid(profileUid || authUser?.uid || '')
    setDeleteTargetNick(profileData?.nick || '')
    setDeleteModalStep(1)
  }

  const handleCloseDeleteModal = () => {
    if (isDeletingAccount || processingDeleteAccount) {
      return
    }

    setDeleteModalStep(null)
  }

  const handleDeleteModalContinue = () => {
    setDeleteConfirmNick('')
    setDeleteModalStep(2)
  }

  const handleDeleteModalConfirm = async () => {
    setLocalDeleteError('')

    try {
      setProcessingDeleteAccount(true)
      if (deleteTargetNick && deleteConfirmNick.trim() !== deleteTargetNick) {
        throw new Error('El nick ingresado no coincide.')
      }

      if (deleteTargetUid && deleteTargetUid !== authUser?.uid) {
        const idToken = await authUser?.getIdToken?.()
        if (!idToken) {
          throw new Error('No se pudo obtener el token de autenticación.')
        }

        await deleteUserAccountByAdmin({ idToken, uid: deleteTargetUid })

        const deletedNick = deleteTargetNick || 'usuario'
        setDeleteModalStep(null)
        setProfileNotice(`La cuenta de ${deletedNick} fue eliminada correctamente.`)

        if (typeof onAccountDeleted === 'function') {
          onAccountDeleted({
            uid: deleteTargetUid,
            nick: deleteTargetNick,
            message: `La cuenta de ${deletedNick} fue eliminada correctamente.`,
          })
        } else {
          onBack?.()
        }

        return
      } else {
        await onDeleteAccount()
      }

      setDeleteModalStep(null)
    } catch (error) {
      setLocalDeleteError(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar tu cuenta.',
      )
    } finally {
      setProcessingDeleteAccount(false)
    }
  }

  const fullName = [profileData?.nombre, profileData?.apellido]
    .filter(Boolean)
    .join(' ')

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    nombre: '',
    apellido: '',
    nick: '',
    fechaNacimiento: '',
  })
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleModalStep, setRoleModalStep] = useState(null)
  const [roleConfirmInput, setRoleConfirmInput] = useState('')
  const isRevokingRole = isAdminRole(profileData?.rol)
  const [profileNotice, setProfileNotice] = useState('')
  const [editFotoData, setEditFotoData] = useState(null)
  const [editFotoPreview, setEditFotoPreview] = useState('')
  const [editFotoFileName, setEditFotoFileName] = useState('')
  const [isEditCropOpen, setIsEditCropOpen] = useState(false)
  const [pendingEditFotoSrc, setPendingEditFotoSrc] = useState('')
  const [pendingEditFotoName, setPendingEditFotoName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const editFotoInputRef = useRef(null)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS_FOR_USER[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportScreenshotFile, setReportScreenshotFile] = useState(null)
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState('')

  //Cuando se carga el perfil o se actualiza la información, actualizo los campos 
  // del formulario de edición para que reflejen los datos actuales del perfil.
  useEffect(() => {
    if (profileData) {
      setEditForm({
        nombre: profileData.nombre || '',
        apellido: profileData.apellido || '',
        nick: profileData.nick || '',
        fechaNacimiento: profileData.fechaNacimiento || '',
      })
      setEditFeaturedComicIds(Array.isArray(profileData.featuredComicIds) ? profileData.featuredComicIds.slice(0, 10) : [])
      setEditFotoData(null)
      setEditFotoFileName('')
      setEditFotoPreview(profileData.fotoPerfil || '')
    }
  }, [profileData])

  useEffect(() => {
    let cancelled = false

    async function loadLibraryItems() {
      const uidToLoad = profileUid || authUser?.uid

      if (!uidToLoad) {
        if (!cancelled) setLibraryItems([])
        return
      }

      try {
        const items = await getUserLibraryItems({ uid: uidToLoad })
        if (!cancelled) setLibraryItems(items)
      } catch {
        if (!cancelled) setLibraryItems([])
      }
    }

    loadLibraryItems()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, profileUid])

  useEffect(() => {
    let cancelled = false
    async function loadCurrentRole() {
      try {
        if (!authUser?.uid) return
        const myProfile = await getUserProfile(authUser.uid)
        if (!cancelled) setCurrentUserRole(myProfile?.rol || '')
      } catch {
        if (!cancelled) setCurrentUserRole('')
      }
    }

    loadCurrentRole()

    return () => { cancelled = true }
  }, [authUser?.uid])

  const handleStartEdit = () => setIsEditing(true)
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditFeaturedComicIds(Array.isArray(profileData?.featuredComicIds) ? profileData.featuredComicIds.slice(0, 10) : [])
    setEditFotoData(null)
    setEditFotoFileName('')
    setIsEditCropOpen(false)
    setPendingEditFotoSrc('')
    setPendingEditFotoName('')
    if (profileData) {
      setEditFotoPreview(profileData.fotoPerfil || '')
      setEditForm({
        nombre: profileData.nombre || '',
        apellido: profileData.apellido || '',
        nick: profileData.nick || '',
        fechaNacimiento: profileData.fechaNacimiento || '',
      })
    }
    if (editFotoInputRef.current) editFotoInputRef.current.value = ''
  }

  const handleEditFotoChange = async (e) => {
    const file = e.target.files?.[0] || null

    if (!file) {
      setEditFotoData(null)
      setEditFotoFileName('')
      setEditFotoPreview(profileData?.fotoPerfil || '')
      setPendingEditFotoSrc('')
      setPendingEditFotoName('')
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setProfileError('La foto de perfil debe ser .jpg, .jpeg, .png o .webp.')
      if (editFotoInputRef.current) editFotoInputRef.current.value = ''
      return
    }

    if (file.size > MAX_PROFILE_PICTURE_SIZE_BYTES) {
      setProfileError('Foto de perfil demasiado pesada. Usa una imagen menor a 500 KB.')
      if (editFotoInputRef.current) editFotoInputRef.current.value = ''
      return
    }

    try {
      const previewUrl = await readFileAsDataUrl(file)
      setPendingEditFotoSrc(previewUrl)
      setPendingEditFotoName(file.name)
      setIsEditCropOpen(true)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No se pudo leer la foto seleccionada.')
      if (editFotoInputRef.current) editFotoInputRef.current.value = ''
    }
  }

  const handleEditCropCancel = () => {
    setIsEditCropOpen(false)
    setPendingEditFotoSrc('')
    setPendingEditFotoName('')
    if (editFotoInputRef.current) editFotoInputRef.current.value = ''
  }

  const handleEditCropConfirm = async (croppedDataUrl) => {
    if (!croppedDataUrl) {
      handleEditCropCancel()
      return
    }

    setEditFotoData({
      dataUrl: croppedDataUrl,
      fileName: pendingEditFotoName || 'foto-recortada.jpg',
    })
    setEditFotoFileName(pendingEditFotoName || 'foto-recortada.jpg')
    setEditFotoPreview(croppedDataUrl)
    setIsEditCropOpen(false)
    setPendingEditFotoSrc('')
    setPendingEditFotoName('')
    if (editFotoInputRef.current) editFotoInputRef.current.value = ''
  }

  //Valido los campos y guardo los cambios en el perfil.
  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      const { nombre, apellido, nick, fechaNacimiento } = editForm

      const safeNick = sanitizeText(nick)
      const safeNombre = sanitizeText(nombre)
      const safeApellido = sanitizeText(apellido)

      if (containsNumbers(safeNombre) || containsNumbers(safeApellido)) {
        throw new Error('Nombre y apellido no pueden contener números.')
      }

      if (!safeNick) {
        throw new Error('El campo "Nick" es obligatorio.')
      }

      if (!fechaNacimiento) {
        throw new Error('Ingresa una fecha de cumpleaños válida.')
      }

      const birthDate = new Date(`${fechaNacimiento}T00:00:00`)
      if (Number.isNaN(birthDate.getTime())) {
        throw new Error('Ingresa una fecha de cumpleaños válida.')
      }

      const now = new Date()
      let age = now.getFullYear() - birthDate.getFullYear()
      const hasNotHadBirthdayYetThisYear =
        now.getMonth() < birthDate.getMonth() ||
        (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate())
      if (hasNotHadBirthdayYetThisYear) age -= 1

      if (age < MINIMUM_AGE) {
        throw new Error(`Debes tener al menos ${MINIMUM_AGE} años para registrarte.`)
      }

      let fotoPayload
      if (editFotoData) {
        const response = await fetch(editFotoData.dataUrl)
        const blob = await response.blob()
        fotoPayload = {
          dataUrl: editFotoData.dataUrl,
          fileName: editFotoData.fileName,
          contentType: blob.type || 'image/jpeg',
          sizeBytes: blob.size,
        }
      }

      await updateUserProfile({
        uid: authUser.uid,
        nombre: safeNombre,
        apellido: safeApellido,
        nick: safeNick,
        fechaNacimiento,
        fotoPerfil: typeof fotoPayload === 'undefined' ? undefined : fotoPayload,
      })

      await updateUserFeaturedComicIds({
        uid: authUser.uid,
        comicIds: editFeaturedComicIds.filter((comicId) =>
          libraryItems.some((item) => item.comicId === comicId),
        ),
      })

      const refreshed = await getUserProfile(authUser.uid)
      setProfileData(refreshed)
      setEditFotoData(null)
      setEditFotoFileName('')
      setIsEditing(false)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No fue posible actualizar el perfil.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleFeaturedComic = (comicId) => {
    setEditFeaturedComicIds((prev) => {
      if (prev.includes(comicId)) {
        return prev.filter((value) => value !== comicId)
      }

      if (prev.length >= 10) {
        setProfileError('Solo puedes destacar hasta 10 comics.')
        return prev
      }

      return [...prev, comicId]
    })
  }

  //Obtengo los items de la biblioteca correspondientes a los comics destacados, respetando el orden definido por el usuario.
  const featuredComicItems = useMemo(() => {
    const selectedIds = Array.isArray(profileData?.featuredComicIds)
      ? profileData.featuredComicIds
      : []

    const itemMap = new Map(libraryItems.map((item) => [item.comicId, item]))
    const sourceIds = isEditing ? editFeaturedComicIds : selectedIds

    return sourceIds
      .map((comicId) => itemMap.get(comicId))
      .filter(Boolean)
      .slice(0, 10)
  }, [editFeaturedComicIds, isEditing, libraryItems, profileData?.featuredComicIds])

  const filteredLibraryItems = useMemo(() => {
    const query = featuredComicSearch.trim().toLowerCase()

    if (!query) {
      return libraryItems
    }

    return libraryItems.filter((item) => {
      const comicName = String(item?.comic?.nombre ?? '').toLowerCase()
      const nick = String(item?.comic?.nick ?? '').toLowerCase()

      return comicName.includes(query) || nick.includes(query)
    })
  }, [featuredComicSearch, libraryItems])

  useEffect(() => {
    setVisibleFeaturedComicCount(12)
  }, [featuredComicSearch, libraryItems])

  const openReportModal = async () => {
    setReportError('')
    setReportDescription('')
    setReportScreenshotFile(null)
    setReportScreenshotPreview('')
    setReportReason(REPORT_REASON_OPTIONS_FOR_USER[0])

    //Verifico si ya hay un reporte pendiente.
    try {
      if (!authUser?.uid || !profileUid) {
        setReportError('No es posible reportar: usuario inválido.')
        return
      }

      const hasPending = await hasPendingObjectReport({ usuarioIdReporta: authUser.uid, objetoReportadoId: profileUid, nombreObjetoReportado: 'usuario' })

      if (hasPending) {
        setReportError('Ya tienes un reporte pendiente para este usuario. Podrás volver a reportarlo cuando se resuelva.')
        setIsReportModalOpen(true)
        return
      }

      setIsReportModalOpen(true)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'No fue posible inicializar el reporte.')
      setIsReportModalOpen(true)
    }
  }

  const closeReportModal = () => {
    if (isSubmittingReport) return
    setIsReportModalOpen(false)
  }

  //Manejo el cambio de captura de pantalla en el reporte.
  const handleReportScreenshotChange = (e) => {
    const file = e.target.files?.[0] || null

    if (reportScreenshotPreview) {
      try { URL.revokeObjectURL(reportScreenshotPreview) } catch { void 0 }
    }

    if (file) {
      setReportScreenshotFile(file)
      setReportScreenshotPreview(URL.createObjectURL(file))
    } else {
      setReportScreenshotFile(null)
      setReportScreenshotPreview('')
    }
  }

  //Envio de reporte y validaciones.
  const handleSubmitUserReport = async (ev) => {
    ev.preventDefault()
    setReportError('')

    try {
      if (!authUser?.uid) throw new Error('Debes iniciar sesión para enviar un reporte.')
      if (!profileUid) throw new Error('Usuario a reportar inválido.')
      if (!reportDescription || !reportDescription.trim()) throw new Error('La descripcion del reporte es obligatoria.')

      setIsSubmittingReport(true)

      let captura = null
      //Si existe una captura de pantalla, la convierto a data URL para guardarla junto con el reporte.
      if (reportScreenshotFile) {
        const dataUrl = await readFileAsDataUrl(reportScreenshotFile)
        captura = {
          dataUrl,
          fileName: reportScreenshotFile.name,
          contentType: reportScreenshotFile.type,
          sizeBytes: reportScreenshotFile.size,
        }
      }

      //Creo el reporte.
      await createReport({
        usuarioIdReporta: authUser.uid,
        objetoReportadoId: profileUid,
        nombreObjetoReportado: 'usuario',
        motivo: reportReason,
        descripcion: reportDescription,
        capturaPantalla: captura,
      })

      setProfileNotice('Reporte enviado correctamente.')
      setIsReportModalOpen(false)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'No fue posible enviar el reporte.')
    } finally {
      setIsSubmittingReport(false)
    }
  }

  const handleConfirmChangeRole = () => {
    setRoleModalStep(2)
    setRoleConfirmInput('')
  }

  const [optionsOpen, setOptionsOpen] = useState(false)
  const toggleOptions = () => setOptionsOpen((s) => !s)
  const optionsOpenRef = useRef(false)

  useEffect(() => {
    optionsOpenRef.current = optionsOpen
  }, [optionsOpen])

  //Cierro el menu de opciones al hacer click afuera.
  useEffect(() => {
    function handleOutsideClick(ev) {
      if (!optionsOpenRef.current) return
      const wrappers = Array.from(document.querySelectorAll('.other-options-wrapper'))
      const clickedInsideAny = wrappers.some((w) => w.contains(ev.target))
      if (!clickedInsideAny) {
        setOptionsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleCancelChangeRole = () => {
    setRoleModalOpen(false)
    setRoleModalStep(null)
    setRoleConfirmInput('')
  }

  //Cambio el rol del usuario. Si el usuario ya es admin, se revoca el rol, si no lo es, se le otorga.
  const handlePerformChangeRole = async () => {
    if (!profileUid) return
    const isRevoking = isAdminRole(profileData?.rol)

    try {
      setIsSaving(true)
      setProfileError('')
      setProfileNotice('')
      const nextRole = isRevoking ? 'usuario' : 'admin'
      await setUserRole(profileUid, nextRole)
      const refreshed = await getUserProfile(profileUid)
      setProfileData(refreshed)
      setProfileNotice(isRevoking ? 'Rol revocado correctamente.' : 'Rol otorgado correctamente.')
      setRoleModalOpen(false)
      setRoleModalStep(null)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No fue posible cambiar el rol.')
    } finally {
      setIsSaving(false)
    }
  }

  if (profileLoading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando datos del perfil...</p>
        </section>
      </main>
    )
  }

  if (isBlockedByProfileUser && !isOwnProfile) {
    return (
      <main className="app-shell profile-page-shell">
        <section className="app-card profile-card">
          <section className="info-card">
            <p className="form-message error" style={{ textAlign: 'center', padding: '20px' }}>
              Este usuario te bloqueó. No puedes ver su perfil.
            </p>
            <div className="profile-blocked-actions profile-blocked-actions-single">
              <button className="profile-back-button" onClick={onBack} type="button">
                Volver atrás
              </button>
            </div>
          </section>
        </section>
      </main>
    )
  }

  if (isBlockingProfileUser && !isOwnProfile) {
    return (
      <main className="app-shell profile-page-shell">
        <section className="app-card profile-card">
          <section className="info-card">
            <p className="form-message error" style={{ textAlign: 'center', padding: '20px' }}>
              Tienes bloqueado a este usuario. No puedes acceder a su perfil.
            </p>
            <div className="profile-blocked-actions">
              <button className="profile-back-button" onClick={onBack} type="button">
                Volver a inicio
              </button>
              <button className="delete-account-button" onClick={onGoToBlockedUsers} type="button">
                Ir a usuarios bloqueados
              </button>
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell profile-page-shell">
      <section className="app-card profile-card">
          <div className="app-hero profile-hero">
          <div className="profile-header">
            <div className="profile-header-media">
              {(isEditing ? (editFotoPreview || profileData?.fotoPerfil) : profileData?.fotoPerfil) ? (
                <img
                  className="profile-header-image"
                  src={isEditing ? (editFotoPreview || profileData.fotoPerfil) : profileData.fotoPerfil}
                  alt={`Foto de ${profileData.nick || 'usuario'}`}
                />
              ) : (
                <div className="profile-header-placeholder">Sin foto</div>
              )}

              {isEditing ? (
                <div className="profile-header-file-input">
                  <FileInput
                    id="edit-foto"
                    accept=".jpg,.jpeg,.png,.webp"
                    onFileChange={(file) => handleEditFotoChange({ target: { files: file ? [file] : [] } })}
                    disabled={isSaving}
                    initialFileName={editFotoFileName}
                  />

                </div>
              ) : null}
            </div>

            <div className="profile-header-body">
              {isEditing ? (
                <input
                  className="profile-nick-input"
                  type="text"
                  value={editForm.nick}
                  onChange={(e) => setEditForm((s) => ({ ...s, nick: sanitizeForbiddenInputChars(e.target.value) }))}
                  disabled={isSaving}
                  aria-label="Nick"
                />
              ) : (
                <h1 className="profile-nick">{profileData?.nick || 'Usuario'}</h1>
              )}

              <div className="profile-stats">
                <button
                  type="button"
                  className="profile-stat profile-stat-highlight"
                  onClick={() => onOpenLibrary ? onOpenLibrary(profileUid || authUser?.uid, profileData?.nick) : window.history.pushState({}, '', '/biblioteca')}
                >
                  <strong>{profileData?.totalComics ?? 0}</strong>
                  <span>Comics</span>
                </button>

                <button
                  type="button"
                  className="profile-stat profile-stat-highlight"
                  onClick={() => onOpenLibrary ? onOpenLibrary(profileUid || authUser?.uid, profileData?.nick) : window.history.pushState({}, '', '/biblioteca')}
                >
                  <strong>{profileData?.totalTomos ?? 0}</strong>
                  <span>Tomos</span>
                </button>
              </div>

            </div>
          </div>

          <div className="hero-actions profile-actions">
            {isOwnProfile ? (
              <>
                {isEditing ? (
                  <div className="profile-header-edit-actions profile-header-edit-actions-right">
                    <Button className="delete-account-button" type="button" onClick={handleCancelEdit} disabled={isSaving} variant="secondary">
                      Cancelar
                    </Button>
                    <Button className="profile-back-button profile-save-button" type="button" onClick={handleSaveProfile} disabled={isSaving} variant="primary">
                      {isSaving ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                  </div>
                ) : (
                  <button className="profile-back-button" type="button" onClick={handleStartEdit}>
                    Editar datos
                  </button>
                )}

                <div className="other-options-wrapper">
                  <button className="dropdown-toggle" onClick={toggleOptions} aria-expanded={optionsOpen} type="button">
                    Otras opciones <span className={`dropdown-arrow ${optionsOpen ? 'open' : ''}`}></span>
                  </button>

                  {optionsOpen ? (
                    <div className="dropdown-menu" role="menu">
                      <button className="dropdown-item" type="button" onClick={() => { onGoToBlockedUsers(); setOptionsOpen(false); }}>
                        Usuarios bloqueados
                      </button>

                      {typeof onLogout === 'function' ? (
                        <button className="dropdown-item logout-item" type="button" onClick={() => { setOptionsOpen(false); onLogout(); }}>
                          Cerrar sesión
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <button
                  className={friendshipStatus === 'friends' ? 'danger-button' : 'profile-back-button'}
                  onClick={
                    friendshipStatus === 'friends'
                      ? handleRemoveFriend
                      : friendshipStatus === 'requested'
                        ? handleCancelSentFriendRequest
                        : handleSendFriendRequest
                  }
                  type="button"
                  disabled={processingFriendship || isBlockedByProfileUser || isBlockingProfileUser}
                >
                  {processingFriendship
                    ? 'Procesando...'
                    : friendshipStatus === 'friends'
                      ? 'Eliminar amigo'
                      : friendshipStatus === 'requested'
                        ? 'Solicitud pendiente'
                        : 'Agregar amigo'}
                </button>

                <div className="other-options-wrapper">
                  <button className="dropdown-toggle" onClick={toggleOptions} aria-expanded={optionsOpen} type="button">
                    Otras opciones <span className={`dropdown-arrow ${optionsOpen ? 'open' : ''}`}></span>
                  </button>

                  {optionsOpen ? (
                    <div className="dropdown-menu" role="menu">
                      {isAdminRole(currentUserRole) ? (
                        <button
                          className="dropdown-item"
                          type="button"
                          onClick={() => {
                            setProfileError('')
                            setProfileNotice('')
                            setRoleConfirmInput('')
                            setRoleModalStep(1)
                            setRoleModalOpen(true)
                            setOptionsOpen(false)
                          }}
                        >
                          {isAdminRole(profileData?.rol) ? 'Revocar administrador' : 'Otorgar administrador'}
                        </button>
                      ) : null}

                      <button
                        className="dropdown-item"
                        type="button"
                        onClick={() => {
                          setOptionsOpen(false)
                          setBlockModalOpen(true)
                        }}
                      >
                        {isBlockingProfileUser ? 'Desbloquear usuario' : 'Bloquear usuario'}
                      </button>

                      <button className="dropdown-item" type="button" onClick={() => { setOptionsOpen(false); openReportModal(); }}>
                        Reportar usuario
                      </button>

                      {isAdminRole(currentUserRole) ? (
                        <button className="dropdown-item delete-account-item" type="button" onClick={() => { setOptionsOpen(false); handleDeleteClick(); }}>
                          Eliminar cuenta
                        </button>
                      ) : null}

                      {typeof onLogout === 'function' ? (
                        <button className="dropdown-item logout-item" type="button" onClick={() => { setOptionsOpen(false); onLogout(); }}>
                          Cerrar sesión
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        {globalError ? <p className="form-message error">{globalError}</p> : null}
        {localDeleteError ? <p className="form-message error">{localDeleteError}</p> : null}
        {profileError ? <p className="form-message error">{profileError}</p> : null}
        {profileNotice ? <p className="form-message success">{profileNotice}</p> : null}

        {profileLoading ? (
          <section className="info-card">
            <p className="status-message">Cargando datos del perfil...</p>
          </section>
        ) : (
          <div className="content-grid profile-grid">
            <section className="info-card">
              <h2>Datos de usuario</h2>

              {!isEditing ? (
                <>
                  <ul className="profile-list">
                    <li>
                      <span>Nombre:</span>
                      <strong>{fullName || 'No definido'}</strong>
                    </li>
                    {isOwnProfile ? (
                      <li>
                        <span>Correo:</span>
                        <strong>{profileData?.email || authUser?.email || 'No definido'}</strong>
                      </li>
                    ) : null}
                    <li>
                      <span>Fecha de nacimiento:</span>
                      <strong>{formatDateDisplay(profileData?.fechaNacimiento) || 'No definido'}</strong>
                    </li>
                    <li>
                      <span>Amigos:</span>
                      <strong>{profileData?.cantidadAmigos ?? 0}</strong>
                    </li>
                  </ul>
                </>
              ) : (
                <div className="profile-edit-form">
                  <label>Nombre (opcional)</label>
                  <input
                    type="text"
                    value={editForm.nombre}
                    onChange={(e) => setEditForm((s) => ({ ...s, nombre: sanitizeNameInput(e.target.value) }))}
                    disabled={isSaving}
                  />

                  <label>Apellido (opcional)</label>
                  <input
                    type="text"
                    value={editForm.apellido}
                    onChange={(e) => setEditForm((s) => ({ ...s, apellido: sanitizeNameInput(e.target.value) }))}
                    disabled={isSaving}
                  />

                  <label>Nick</label>
                  <input
                    type="text"
                    value={editForm.nick}
                    onChange={(e) => setEditForm((s) => ({ ...s, nick: sanitizeForbiddenInputChars(e.target.value) }))}
                    disabled={isSaving}
                  />

                  <label>Fecha de nacimiento</label>
                  <input
                    type="date"
                    value={editForm.fechaNacimiento}
                    onChange={(e) => setEditForm((s) => ({ ...s, fechaNacimiento: e.target.value }))}
                    disabled={isSaving}
                  />
                </div>
              )}
            </section>
          </div>
        )}

        {!profileLoading ? (
          <section className="info-card featured-comics-card">
            <div className="featured-comics-header">
              <div>
                <h2>Comics destacados</h2>
                <p className="helper-text">
                  {isOwnProfile
                    ? 'Estos son los comics destacados por este usuario.'
                    : 'Selecciona hasta 10 comics de tu biblioteca para destacarlos en tu perfil.'}
                </p>
              </div>

              {isEditing ? (
                <p className="featured-comics-count">{editFeaturedComicIds.length}/10 seleccionados</p>
              ) : null}
            </div>

            {isOwnProfile && isEditing ? (
              <div className="featured-comics-picker">
                <div className="featured-comics-search">
                  <label htmlFor="featured-comics-search-input">Buscar en tu biblioteca</label>
                  <input
                    id="featured-comics-search-input"
                    type="search"
                    value={featuredComicSearch}
                    onChange={(e) => setFeaturedComicSearch(e.target.value)}
                    placeholder="Escribe el nombre del comic"
                  />
                </div>

                {filteredLibraryItems.length === 0 ? (
                  <p className="search-empty-state">
                    {libraryItems.length === 0
                      ? 'No tienes comics en tu biblioteca para destacar.'
                      : 'No hay comics que coincidan con la búsqueda.'}
                  </p>
                ) : (
                  <>
                    <div className="featured-comics-grid selectable">
                      {filteredLibraryItems.slice(0, visibleFeaturedComicCount).map((item) => {
                      const isSelected = editFeaturedComicIds.includes(item.comicId)
                      const featuredVolume = getFeaturedLibraryVolume(item.volumes)
                      const actionLabel = getFeaturedActionLabel({
                        isSelected,
                        selectedCount: editFeaturedComicIds.length,
                      })

                      return (
                        <button
                          key={item.comicId}
                          type="button"
                          className={`featured-comic-card selectable ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleFeaturedComic(item.comicId)}
                          aria-pressed={isSelected}
                        >
                          <div className="featured-comic-cover">
                            {featuredVolume?.portada?.dataUrl ? (
                              <img
                                src={featuredVolume.portada.dataUrl}
                                alt={`Portada de ${item.comic.nombre}`}
                              />
                            ) : (
                              <div className="featured-comic-placeholder">Sin portada</div>
                            )}
                          </div>

                          <div className="featured-comic-info">
                            <strong>{item.comic.nombre}</strong>
                            <span>{item.volumes.length} tomos en biblioteca</span>
                            <span>{isSelected ? 'Destacado' : 'Disponible para destacar'}</span>
                            <span className="featured-comic-action">{actionLabel}</span>
                          </div>
                        </button>
                      )
                      })}
                    </div>

                    {filteredLibraryItems.length > visibleFeaturedComicCount ? (
                      <div className="featured-comics-footer">
                        <p className="featured-comics-footer-text">
                          Mostrando {Math.min(visibleFeaturedComicCount, filteredLibraryItems.length)} de {filteredLibraryItems.length} comics
                        </p>

                        <button
                          type="button"
                          className="profile-back-button featured-comics-load-more"
                          onClick={() => setVisibleFeaturedComicCount((prev) => prev + 12)}
                        >
                          Ver más comics
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : featuredComicItems.length === 0 ? (
              <p className="search-empty-state">Este perfil todavía no tiene comics destacados.</p>
            ) : (
              <div className="featured-comics-grid">
                {featuredComicItems.map((item) => {
                  const featuredVolume = getFeaturedLibraryVolume(item.volumes)

                  return (
                    <button
                      key={item.comicId}
                      type="button"
                      className="featured-comic-card"
                      onClick={() => onOpenComic?.(item.comicId)}
                    >
                      <div className="featured-comic-cover">
                        {featuredVolume?.portada?.dataUrl ? (
                          <img
                            src={featuredVolume.portada.dataUrl}
                            alt={`Portada de ${item.comic.nombre}`}
                          />
                        ) : (
                          <div className="featured-comic-placeholder">Sin portada</div>
                        )}
                      </div>

                      <div className="featured-comic-info">
                        <strong>{item.comic.nombre}</strong>
                        <span>{item.volumes.length} tomos guardados</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        ) : null}

        {isOwnProfile ? (
          <div className="profile-delete-footer">
            <button
              className="delete-account-button"
              onClick={handleDeleteClick}
              type="button"
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? 'Eliminando cuenta...' : 'Eliminar cuenta'}
            </button>
          </div>
        ) : null}
      </section>

      {deleteModalStep ? (
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={handleCloseDeleteModal}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="confirm-modal-eyebrow">ATENCION</p>
            <h2 id="delete-account-modal-title">Estas a punto de eliminar una cuenta</h2>

            {deleteModalStep === 1 ? (
              <p className="confirm-modal-text">¿Seguro que deseas continuar?</p>
            ) : (
              <>
                <p className="confirm-modal-text">
                  Esta acción es permanente y eliminará todos los datos del usuario <strong>{deleteTargetNick}</strong>. Para confirmar, escribe el nick exacto.
                </p>
                <input
                 className="profile-nick-input"
                  type="text"
                  value={deleteConfirmNick}
                  onChange={(event) => setDeleteConfirmNick(sanitizeForbiddenInputChars(event.target.value))}
                  placeholder={`Escribe ${deleteTargetNick || 'el nick'} para confirmar`}
                />
              </>
            )}

            <div className="confirm-modal-actions">
              <button
                className="profile-back-button"
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={isDeletingAccount || processingDeleteAccount}
              >
                Cancelar
              </button>

              {deleteModalStep === 1 ? (
                <button
                  className="delete-account-button"
                  type="button"
                  onClick={handleDeleteModalContinue}
                  disabled={isDeletingAccount || processingDeleteAccount}
                >
                  Continuar
                </button>
              ) : (
                <button
                  className="delete-account-button"
                  type="button"
                  onClick={handleDeleteModalConfirm}
                  disabled={isDeletingAccount || processingDeleteAccount || deleteConfirmNick.trim() !== (deleteTargetNick || '')}
                >
                  {isDeletingAccount || processingDeleteAccount ? 'Eliminando cuenta...' : 'Sí, eliminar cuenta'}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isReportModalOpen ? (
        <div className="confirm-modal-backdrop"
          role="presentation"
          onClick={closeReportModal}
        >
          <div className="confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Reportar usuario</h2>

            {reportError ? <p className="form-message error">{reportError}</p> : null}

            <form className="report-form" onSubmit={handleSubmitUserReport}>
              <label>Motivo</label>
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} disabled={isSubmittingReport}>
                {REPORT_REASON_OPTIONS_FOR_USER.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <label>Descripción</label>
              <textarea value={reportDescription} onChange={(e) => setReportDescription(sanitizeForbiddenInputChars(e.target.value))} rows={4} placeholder="Describe brevemente el problema." disabled={isSubmittingReport} />

              <label>Captura de pantalla (opcional)</label>
              <FileInput
                id="profile-report-screenshot"
                accept=".jpg,.jpeg,.png,.webp"
                onFileChange={(file) => handleReportScreenshotChange({ target: { files: file ? [file] : [] } })}
                disabled={isSubmittingReport}
                initialFileName={reportScreenshotFile?.name}
              />

              {reportScreenshotPreview ? (
                <div className="report-screenshot-preview-card">
                  <img src={reportScreenshotPreview} alt="Vista previa de la captura" className="report-screenshot-preview-image" />
                </div>
              ) : null}

                <div className="profile-edit-actions">
                  <Button variant="secondary" className="profile-back-button" type="button" onClick={closeReportModal} disabled={isSubmittingReport}>Cancelar</Button>
                  <Button variant="primary" className="delete-account-button" type="submit" disabled={isSubmittingReport}>{isSubmittingReport ? 'Enviando reporte...' : 'Enviar reporte'}</Button>
                </div>
            </form>
          </div>
        </div>
      ) : null}

      {blockModalOpen ? (
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={() => setBlockModalOpen(false)}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-user-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="confirm-modal-eyebrow">ATENCION</p>
            <h2 id="block-user-modal-title">Confirmar bloqueo</h2>
            <p className="confirm-modal-text">
              ¿Estas seguro de que deseas bloquear a <strong>{profileData?.nick}</strong>?
            </p>
            {friendshipStatus === 'friends' && (
              <p className="profile-block-warning-text">
                Se eliminará la amistad entre ustedes.
              </p>
            )}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="profile-back-button"
                onClick={() => setBlockModalOpen(false)}
                disabled={processingBlock}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="delete-account-button"
                onClick={handleBlockUser}
                disabled={processingBlock}
              >
                {processingBlock ? 'Bloqueando...' : 'Bloquear'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {roleModalOpen ? (
        <div className="confirm-modal-backdrop"
          role="presentation"
          onClick={handleCancelChangeRole}
        >
          <div className="confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="confirm-modal-eyebrow">ATENCIÓN — Cambio de rol</p>
            <h2>{isRevokingRole ? 'Vas a revocar permisos de administrador' : 'Vas a otorgar permisos de administrador'}</h2>
            {roleModalStep === 1 ? (
              <>
                <p className="confirm-modal-text">
                  {isRevokingRole ? (
                    <>Estás a punto de <strong>revocar</strong> los permisos de administrador de <strong>{profileData?.nick}</strong>. Esta acción le quitará acceso a funciones de administración.</>
                  ) : (
                    <>Estás a punto de convertir a <strong>{profileData?.nick}</strong> en administrador. Esta acción le dará acceso a funciones sensibles.</>
                  )}
                </p>
                <div className="profile-edit-actions">
                  <button className="profile-back-button" type="button" onClick={handleCancelChangeRole}>
                    Cancelar
                  </button>
                  <button className="delete-account-button" type="button" onClick={handleConfirmChangeRole}>
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="confirm-modal-text">
                  {isRevokingRole ? (
                    <>Para confirmar la <strong>revocación</strong>, escribe el nick de <strong>{profileData?.nick}</strong> en el campo de abajo y presiona "Confirmar cambio".</>
                  ) : (
                    <>Confirma por favor escribiendo el nick del usuario (<strong>{profileData?.nick}</strong>) en el campo de abajo y presiona "Confirmar cambio".</>
                  )}
                </p>
                <input
                className="profile-nick-input"
                  type="text"
                  value={roleConfirmInput}
                  onChange={(e) => setRoleConfirmInput(e.target.value)}
                  placeholder={`Escribe ${profileData?.nick} para confirmar`}
                />

                <div  className="profile-edit-actions">
                  <button className="profile-back-button" type="button" onClick={handleCancelChangeRole} disabled={isSaving}>
                    Cancelar
                  </button>
                  <button
                    className="delete-account-button"
                    type="button"
                    onClick={handlePerformChangeRole}
                    disabled={isSaving || roleConfirmInput !== (profileData?.nick || '')}
                  >
                    {isSaving ? 'Guardando...' : 'Confirmar cambio'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <ImageCropperModal
        open={isEditCropOpen}
        imageSrc={pendingEditFotoSrc}
        title="Recortar foto de perfil"
        subtitle="Ajusta la imagen antes de guardarla en tu perfil."
        confirmLabel="Guardar recorte"
        onCancel={handleEditCropCancel}
        onConfirm={handleEditCropConfirm}
      />
    </main>
  )
}

export default ProfilePage
