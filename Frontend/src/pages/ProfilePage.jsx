import { useEffect, useState } from 'react'
import {
  getUserProfile,
  updateUserProfile,
  sendFriendRequest,
  areFriends,
  removeFriend,
  getFriendRequests,
  blockUser,
  unblockUser,
  isUserBlocked,
  setUserRole,
  deleteUserAccountByAdmin,
} from '../firebase/user'
import { createReport, hasPendingObjectReport, REPORT_REASON_OPTIONS_FOR_USER } from '../firebase/reports'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_PROFILE_PICTURE_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import '../styles/ProfilePage.css'

const MINIMUM_AGE = 18

function sanitizeText(input) {
  if (!input) return ''
  return String(input)
    .split('')
    .filter((character) => !'@#$^&*{}[]<>'.includes(character))
    .join('')
    .trim()
}

function isAdminRole(role) {
  return String(role || '').toLowerCase().includes('admin')
}

function ProfilePage({
  authUser,
  onBack,
  onDeleteAccount,
  onAccountDeleted,
  isDeletingAccount,
  globalError,
  profileUid,
  onGoToBlockedUsers,
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
  const [friendshipStatus, setFriendshipStatus] = useState('none') // 'none', 'friends', 'pending', 'requested'
  const [processingFriendship, setProcessingFriendship] = useState(false)
  const [isBlockedByProfileUser, setIsBlockedByProfileUser] = useState(false)
  const [isBlockingProfileUser, setIsBlockingProfileUser] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [processingBlock, setProcessingBlock] = useState(false)

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
          const blocked = await isUserBlocked(authUser.uid, profileUid)

          if (!cancelled) {
            setIsBlockedByProfileUser(blocked)
          }
        } else if (!cancelled) {
          setIsBlockedByProfileUser(false)
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
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, profileUid])

  // Cargar estado de amistad cuando vemos otro perfil
  useEffect(() => {
    let cancelled = false

    async function loadFriendshipStatus() {
      if (!profileUid || profileUid === authUser?.uid) {
        setFriendshipStatus('none')
        return
      }

      try {
        const isFriend = await areFriends(authUser.uid, profileUid)

        if (!cancelled) {
          if (isFriend) {
            setFriendshipStatus('friends')
          } else {
            // Verificar si hay solicitud pendiente
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
  }, [authUser?.uid, profileUid])

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

  const handleBlockUser = async () => {
    if (!profileUid) return

    try {
      setProcessingBlock(true)
      await blockUser(authUser.uid, profileUid)
      setIsBlockingProfileUser(true)
      setBlockModalOpen(false)
      setProfileError('Usuario bloqueado exitosamente.')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'No fue posible bloquear el usuario.'
      )
    } finally {
      setProcessingBlock(false)
    }
  }

  const handleUnblockUser = async () => {
    if (!profileUid) return

    try {
      setProcessingBlock(true)
      await unblockUser(authUser.uid, profileUid)
      setIsBlockingProfileUser(false)
      setProfileError('Usuario desbloqueado exitosamente.')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'No fue posible desbloquear el usuario.'
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
    fechaCumpleanos: '',
  })
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleModalStep, setRoleModalStep] = useState(null)
  const [roleConfirmInput, setRoleConfirmInput] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [editFotoFile, setEditFotoFile] = useState(null)
  const [editFotoPreview, setEditFotoPreview] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Report user state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS_FOR_USER[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportScreenshotFile, setReportScreenshotFile] = useState(null)
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    if (profileData) {
      setEditForm({
        nombre: profileData.nombre || '',
        apellido: profileData.apellido || '',
        nick: profileData.nick || '',
        fechaCumpleanos: profileData.fechaCumpleanos || '',
      })
      setEditFotoPreview(profileData.fotoPerfil || '')
    }
  }, [profileData])

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
    setEditFotoFile(null)
    if (profileData) setEditFotoPreview(profileData.fotoPerfil || '')
  }

  const handleEditFotoChange = (e) => {
    const file = e.target.files?.[0] || null

    if (editFotoPreview) {
      try {
        URL.revokeObjectURL(editFotoPreview)
      } catch (error) {
        void error
      }
    }

    if (file) {
      setEditFotoFile(file)
      setEditFotoPreview(URL.createObjectURL(file))
    } else {
      setEditFotoFile(null)
      setEditFotoPreview(profileData?.fotoPerfil || '')
    }
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      const { nombre, apellido, nick, fechaCumpleanos } = editForm

      const safeNick = sanitizeText(nick)
      const safeNombre = sanitizeText(nombre)
      const safeApellido = sanitizeText(apellido)

      if (!safeNick) {
        throw new Error('El campo "Nick" es obligatorio.')
      }

      if (!fechaCumpleanos) {
        throw new Error('Ingresa una fecha de cumpleaños válida.')
      }

      const birthDate = new Date(`${fechaCumpleanos}T00:00:00`)
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
      if (editFotoFile) {
        if (!ALLOWED_IMAGE_TYPES.includes(editFotoFile.type)) {
          throw new Error('Foto de perfil debe ser .jpg, .jpeg, .png o .webp.')
        }
        if (editFotoFile.size > MAX_PROFILE_PICTURE_SIZE_BYTES) {
          throw new Error('Foto de perfil demasiado pesada. Usa una imagen menor a 500 KB.')
        }
        const dataUrl = await readFileAsDataUrl(editFotoFile)
        fotoPayload = {
          dataUrl,
          fileName: editFotoFile.name,
          contentType: editFotoFile.type,
          sizeBytes: editFotoFile.size,
        }
      }

      await updateUserProfile({
        uid: authUser.uid,
        nombre: safeNombre,
        apellido: safeApellido,
        nick: safeNick,
        fechaCumpleanos,
        fotoPerfil: typeof fotoPayload === 'undefined' ? undefined : fotoPayload,
      })

      const refreshed = await getUserProfile(authUser.uid)
      setProfileData(refreshed)
      setIsEditing(false)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No fue posible actualizar el perfil.')
    } finally {
      setIsSaving(false)
    }
  }

  const openReportModal = async () => {
    setReportError('')
    setReportDescription('')
    setReportScreenshotFile(null)
    setReportScreenshotPreview('')
    setReportReason(REPORT_REASON_OPTIONS_FOR_USER[0])

    // verificar si ya hay un reporte pendiente
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

  const handleSubmitUserReport = async (ev) => {
    ev.preventDefault()
    setReportError('')

    try {
      if (!authUser?.uid) throw new Error('Debes iniciar sesión para enviar un reporte.')
      if (!profileUid) throw new Error('Usuario a reportar inválido.')
      if (!reportDescription || !reportDescription.trim()) throw new Error('La descripcion del reporte es obligatoria.')

      setIsSubmittingReport(true)

      let captura = null
      if (reportScreenshotFile) {
        const dataUrl = await readFileAsDataUrl(reportScreenshotFile)
        captura = {
          dataUrl,
          fileName: reportScreenshotFile.name,
          contentType: reportScreenshotFile.type,
          sizeBytes: reportScreenshotFile.size,
        }
      }

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
    // advance to final confirmation step
    setRoleModalStep(2)
    setRoleConfirmInput('')
  }

  const handleCancelChangeRole = () => {
    setRoleModalOpen(false)
    setRoleModalStep(null)
    setRoleConfirmInput('')
  }

  const handlePerformChangeRole = async () => {
    if (!profileUid) return

    try {
      setIsSaving(true)
      setProfileError('')
      setProfileNotice('')
      // call firebase
      await setUserRole(profileUid, 'admin')
      const refreshed = await getUserProfile(profileUid)
      setProfileData(refreshed)
      setProfileNotice('Rol actualizado a admin correctamente.')
      setRoleModalOpen(false)
      setRoleModalStep(null)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No fue posible cambiar el rol.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card profile-card">
        <div className="app-hero profile-hero">
          <div>
            <p className="eyebrow">Comiku / Perfil</p>
            <h1>Perfil de usuario</h1>
            <p className="lead">Aquí puedes revisar tus datos y eliminar tu cuenta.</p>
          </div>

          <div className="hero-actions profile-actions">
            <button className="profile-back-button" onClick={onBack} type="button">
              Volver al inicio
            </button>
                {profileUid &&
                profileUid !== authUser?.uid &&
                isAdminRole(currentUserRole) &&
                !isAdminRole(profileData?.rol) ? (
                  <button
                    className="profile-back-button"
                    onClick={() => {
                      setProfileError('')
                      setProfileNotice('')
                      setRoleConfirmInput('')
                      setRoleModalStep(1)
                      setRoleModalOpen(true)
                    }}
                    type="button"
                  >
                    Cambiar rol
                  </button>
                ) : null}

            {profileUid && profileUid !== authUser?.uid ? (
              <>
                <button
                  className={friendshipStatus === 'friends' ? 'delete-account-button' : 'profile-back-button'}
                  onClick={friendshipStatus === 'friends' ? handleRemoveFriend : handleSendFriendRequest}
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

                <button
                  className={isBlockingProfileUser ? 'delete-account-button' : 'profile-back-button'}
                  onClick={isBlockingProfileUser ? handleUnblockUser : () => setBlockModalOpen(true)}
                  type="button"
                  disabled={processingBlock}
                >
                  {processingBlock
                    ? 'Procesando...'
                    : isBlockingProfileUser
                      ? 'Desbloquear usuario'
                      : 'Bloquear usuario'}
                </button>
                {isAdminRole(currentUserRole) ? (
                  <button
                    className="delete-account-button"
                    onClick={handleDeleteClick}
                    type="button"
                    disabled={isBlockingProfileUser}
                  >
                    Eliminar cuenta
                  </button>
                ) : null}
                <button
                  className="profile-back-button"
                  onClick={openReportModal}
                  type="button"
                  disabled={isBlockingProfileUser}
                >
                  Reportar usuario
                </button>
              </>
            ) : (
              <>
                {!isEditing ? (
                  <button className="profile-back-button" onClick={handleStartEdit} type="button">
                    Editar perfil
                  </button>
                ) : (
                  <>
                    <button className="profile-back-button" onClick={handleCancelEdit} type="button">
                      Cancelar
                    </button>
                    <button className="delete-account-button" onClick={handleSaveProfile} type="button" disabled={isSaving}>
                      {isSaving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </>
                )}

                <button className="profile-back-button" onClick={onGoToBlockedUsers} type="button">
                  Usuarios bloqueados
                </button>
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
        ) : isBlockedByProfileUser && profileUid && profileUid !== authUser?.uid ? (
          <section className="info-card">
            <p className="form-message error" style={{ textAlign: 'center', padding: '20px' }}>
              Este usuario te bloqueó. No puedes ver su perfil.
            </p>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button className="profile-back-button" onClick={onBack} type="button">
                Volver atrás
              </button>
            </div>
          </section>
        ) : (
          <div className="content-grid profile-grid">
            <section className="info-card">
              <h2>Datos básicos</h2>

              {!isEditing ? (
                <>
                  <ul className="profile-list">
                    <li>
                      <span>UID:</span>
                      <strong>{profileData?.uid || authUser?.uid || 'N/A'}</strong>
                    </li>
                    <li>
                      <span>Nombre:</span>
                      <strong>{fullName || 'No definido'}</strong>
                    </li>
                    <li>
                      <span>Nick:</span>
                      <strong>{profileData?.nick || 'No definido'}</strong>
                    </li>
                    <li>
                      <span>Email:</span>
                      <strong>{profileData?.email || authUser?.email || 'No definido'}</strong>
                    </li>
                    <li>
                      <span>Rol:</span>
                      <strong>{profileData?.rol || 'usuario'}</strong>
                    </li>
                    <li>
                      <span>Cumpleaños:</span>
                      <strong>{profileData?.fechaCumpleanos || 'No definido'}</strong>
                    </li>
                    <li>
                      <span>Total cómics en biblioteca:</span>
                      <strong>{profileData?.totalComics ?? 0}</strong>
                    </li>
                    <li>
                      <span>Total tomos en biblioteca:</span>
                      <strong>{profileData?.totalTomos ?? 0}</strong>
                    </li>
                    <li>
                      <span>Amigos:</span>
                      <strong>{profileData?.cantidadAmigos ?? 0}</strong>
                    </li>
                  </ul>

                  {profileData?.fotoPerfil && (
                    <div className="profile-picture-section">
                      <p className="profile-picture-label">Foto de perfil:</p>
                      <img
                        className="profile-picture"
                        src={profileData.fotoPerfil}
                        alt="Foto de perfil del usuario"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="profile-edit-form">
                  <label>Nombre (opcional)</label>
                  <input
                    type="text"
                    value={editForm.nombre}
                    onChange={(e) => setEditForm((s) => ({ ...s, nombre: e.target.value }))}
                    disabled={isSaving}
                  />

                  <label>Apellido (opcional)</label>
                  <input
                    type="text"
                    value={editForm.apellido}
                    onChange={(e) => setEditForm((s) => ({ ...s, apellido: e.target.value }))}
                    disabled={isSaving}
                  />

                  <label>Nick</label>
                  <input
                    type="text"
                    value={editForm.nick}
                    onChange={(e) => setEditForm((s) => ({ ...s, nick: e.target.value }))}
                    disabled={isSaving}
                  />

                  <label>Fecha de cumpleaños</label>
                  <input
                    type="date"
                    value={editForm.fechaCumpleanos}
                    onChange={(e) => setEditForm((s) => ({ ...s, fechaCumpleanos: e.target.value }))}
                    disabled={isSaving}
                  />

                  <label>Foto de perfil (opcional)</label>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleEditFotoChange} disabled={isSaving} />

                  {editFotoPreview && (
                    <div className="cover-preview-card">
                      <p className="helper-text">Vista previa</p>
                      <img className="cover-preview-image" src={editFotoPreview} alt="Preview" />
                    </div>
                  )}
                </div>
              )}
            </section>

            {(!profileUid || profileUid === authUser?.uid) && (
              <section className="info-card danger-zone">
                <h2>Zona de peligro</h2>
                <p>
                  Al eliminar la cuenta, se borrará tu usuario de autenticación y tus
                  documentos de Firestore asociados por UID.
                </p>
                <p>
                  El sistema aplica doble confirmación para evitar eliminaciones
                  accidentales.
                </p>

                <button
                  className="delete-account-button"
                  onClick={handleDeleteClick}
                  type="button"
                  disabled={isDeletingAccount}
                >
                  {isDeletingAccount ? 'Eliminando cuenta...' : 'Eliminar cuenta'}
                </button>
              </section>
            )}
          </div>
        )}
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
                  type="text"
                  value={deleteConfirmNick}
                  onChange={(event) => setDeleteConfirmNick(event.target.value)}
                  placeholder={`Escribe ${deleteTargetNick || 'el nick'} para confirmar`}
                  style={{ width: '100%', padding: '8px', marginTop: 12 }}
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
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          role="presentation"
          onClick={closeReportModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '580px',
              width: '100%',
              boxShadow: '0 6px 18px rgba(0,0,0,0.18)'
            }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="eyebrow">Comiku / Reportar usuario</p>
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
              <textarea value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} rows={4} placeholder="Describe brevemente el problema." disabled={isSubmittingReport} />

              <label>Captura de pantalla (opcional)</label>
              <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleReportScreenshotChange} disabled={isSubmittingReport} />

              {reportScreenshotPreview ? (
                <div className="report-screenshot-preview-card">
                  <img src={reportScreenshotPreview} alt="Vista previa de la captura" className="report-screenshot-preview-image" />
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="profile-back-button" onClick={closeReportModal} disabled={isSubmittingReport}>Cancelar</button>
                <button type="submit" className="delete-account-button" disabled={isSubmittingReport}>{isSubmittingReport ? 'Enviando reporte...' : 'Enviar reporte'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {blockModalOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h2>Confirmar bloqueo</h2>
            <p>
              ¿Estás seguro de que deseas bloquear a <strong>{profileData?.nick}</strong>?
            </p>
            {friendshipStatus === 'friends' && (
              <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                Se eliminará la amistad entre ustedes.
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
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
          </div>
        </div>
      ) : null}

      {roleModalOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          role="presentation"
          onClick={handleCancelChangeRole}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="confirm-modal-eyebrow">ATENCIÓN — Cambio de rol</p>
            <h2>Vas a otorgar permisos de administrador</h2>
            {roleModalStep === 1 ? (
              <>
                <p className="confirm-modal-text">
                  Estás a punto de convertir a <strong>{profileData?.nick}</strong> en administrador.
                  Esta acción le dará acceso a funciones sensibles.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
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
                  Confirma por favor escribiendo el nick del usuario (<strong>{profileData?.nick}</strong>)
                  en el campo de abajo y presiona "Confirmar cambio".
                </p>
                <input
                  type="text"
                  value={roleConfirmInput}
                  onChange={(e) => setRoleConfirmInput(e.target.value)}
                  placeholder={`Escribe ${profileData?.nick} para confirmar`}
                  style={{ width: '100%', padding: '8px', marginTop: 12 }}
                />

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
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
    </main>
  )
}

export default ProfilePage
