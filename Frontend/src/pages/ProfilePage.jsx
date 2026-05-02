import { useEffect, useState } from 'react'
import { getUserProfile } from '../firebase/user'
import '../styles/ProfilePage.css'

function ProfilePage({
  authUser,
  onBack,
  onDeleteAccount,
  isDeletingAccount,
  globalError,
}) {
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [profileData, setProfileData] = useState(null)
  const [localDeleteError, setLocalDeleteError] = useState('')
  const [deleteModalStep, setDeleteModalStep] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (!authUser?.uid) {
        setProfileData(null)
        setProfileLoading(false)
        return
      }

      try {
        setProfileLoading(true)
        setProfileError('')
        const data = await getUserProfile(authUser.uid)

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
  }, [authUser?.uid])

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
          </div>
        </div>

        {globalError ? <p className="form-message error">{globalError}</p> : null}
        {localDeleteError ? <p className="form-message error">{localDeleteError}</p> : null}
        {profileError ? <p className="form-message error">{profileError}</p> : null}

        {profileLoading ? (
          <section className="info-card">
            <p className="status-message">Cargando datos del perfil...</p>
          </section>
        ) : (
          <div className="content-grid profile-grid">
            <section className="info-card">
              <h2>Datos básicos</h2>
              <ul className="profile-list">
                <li>
                  <span>UID:</span>
                  <strong>{authUser?.uid || 'N/A'}</strong>
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
            </section>

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
    </main>
  )
}

export default ProfilePage
