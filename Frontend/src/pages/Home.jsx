import { useEffect, useState } from 'react'
import { logout, subscribeToAuthChanges } from '../firebase/auth'
import { firebaseSetupMessage, isFirebaseConfigured } from '../firebase/firebase'
import { deleteCurrentAccountData } from '../firebase/user'
import LoginPage from './LoginPage'
import ProfilePage from './ProfilePage'
import RegisterPage from './RegisterPage'
import '../styles/Home.css'

function Home() {
  const [authLoading, setAuthLoading] = useState(true)
  const [authUser, setAuthUser] = useState(null)
  const [activeForm, setActiveForm] = useState('login')
  const [activePage, setActivePage] = useState(() =>
    window.location.pathname === '/perfil' ? 'profile' : 'home',
  )
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  const goToHome = () => {
    window.history.replaceState({}, '', '/')
  }

  const goToProfile = () => {
    window.history.pushState({}, '', '/perfil')
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
      setActivePage(window.location.pathname === '/perfil' ? 'profile' : 'home')
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const handleLogout = async () => {
    setAuthError('')
    setAuthNotice('')

    try {
      await logout()
      setAuthUser(null)
      setActiveForm('login')
      setActivePage('home')
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
      setActiveForm('login')
      setActivePage('home')
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
      <main className="app-shell">
        <section className="app-card auth-card">
          <div className="app-hero auth-hero">
            <div>
              <p className="eyebrow">Comiku / Auth</p>
              <h1>Bienvenido a Comiku</h1>
              <p className="lead">
                Crea tu cuenta o inicia sesión para ingresar al inicio de la app.
              </p>
            </div>
          </div>

          {!isFirebaseConfigured ? (
            <div className="status-panel auth-message-panel">
              <p className="status-message">{firebaseSetupMessage}</p>
            </div>
          ) : null}

          <div className="auth-switch" role="tablist" aria-label="Tipo de formulario">
            <button
              className={`switch-button ${activeForm === 'login' ? 'active' : ''}`}
              onClick={() => {
                setActiveForm('login')
                setAuthError('')
              }}
              role="tab"
              aria-selected={activeForm === 'login'}
              type="button"
            >
              Logueo
            </button>
            <button
              className={`switch-button ${activeForm === 'register' ? 'active' : ''}`}
              onClick={() => {
                setActiveForm('register')
                setAuthError('')
              }}
              role="tab"
              aria-selected={activeForm === 'register'}
              type="button"
            >
              Registro
            </button>
          </div>

          {authError ? <p className="form-message error">{authError}</p> : null}
          {authNotice ? <p className="form-message success">{authNotice}</p> : null}

          {activeForm === 'register' ? (
            <RegisterPage
              isFirebaseConfigured={isFirebaseConfigured}
              onAuthenticated={handleAuthenticated}
              onError={setAuthError}
              onNotice={setAuthNotice}
            />
          ) : (
            <LoginPage
              isFirebaseConfigured={isFirebaseConfigured}
              onAuthenticated={handleAuthenticated}
              onError={setAuthError}
            />
          )}
        </section>
      </main>
    )
  }

  if (activePage === 'profile') {
    return (
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
    )
  }

  return (
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
  )
}

export default Home