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
} from '../firebase/user'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_PROFILE_PICTURE_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import '../styles/ProfilePage.css'

const MINIMUM_AGE = 18

function sanitizeText(input) {
  if (!input) return ''
  return String(input).replace(/[@#\$\^&\*\{\}\[\]<>]/g, '').trim()
}

function ProfilePage({
  authUser,
  onBack,
  onDeleteAccount,
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
    setDeleteModalStep(1)
  }

  const handleCloseDeleteModal = () => {
    if (isDeletingAccount) {
      return
    }

    setDeleteModalStep(null)
  }

  const handleDeleteModalContinue = () => {
    setDeleteModalStep(2)
  }

  const handleDeleteModalConfirm = async () => {
    setLocalDeleteError('')

    try {
      await onDeleteAccount()
      setDeleteModalStep(null)
    } catch (error) {
      setLocalDeleteError(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar tu cuenta.',
      )
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
  const [editFotoFile, setEditFotoFile] = useState(null)
  const [editFotoPreview, setEditFotoPreview] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData])

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
      } catch {}
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
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'No fue posible actualizar el perfil.')
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
            <h2 id="delete-account-modal-title">Estas a punto de eliminar tu cuenta</h2>

            {deleteModalStep === 1 ? (
              <p className="confirm-modal-text">¿Seguro que deseas continuar?</p>
            ) : (
              <p className="confirm-modal-text">
                Esta acción es permanente y eliminará tus datos. ¿Deseas continuar?
              </p>
            )}

            <div className="confirm-modal-actions">
              <button
                className="profile-back-button"
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={isDeletingAccount}
              >
                Cancelar
              </button>

              {deleteModalStep === 1 ? (
                <button
                  className="delete-account-button"
                  type="button"
                  onClick={handleDeleteModalContinue}
                  disabled={isDeletingAccount}
                >
                  Continuar
                </button>
              ) : (
                <button
                  className="delete-account-button"
                  type="button"
                  onClick={handleDeleteModalConfirm}
                  disabled={isDeletingAccount}
                >
                  {isDeletingAccount ? 'Eliminando cuenta...' : 'Sí, eliminar cuenta'}
                </button>
              )}
            </div>
          </section>
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
    </main>
  )
}

export default ProfilePage
