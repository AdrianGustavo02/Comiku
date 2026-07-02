import { useState } from 'react'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import '../styles/AuthPage.css'

const appIconUrl = `${import.meta.env.BASE_URL}icon.png`

function AuthPage({
  onAuthenticated,
  authError,
  authNotice,
  onAuthError,
  onAuthNotice,
}) {
  const [activeForm, setActiveForm] = useState('login')

  return (
    <main className="app-shell">
      <section className="auth-page-card">
        <div className="auth-form-brand auth-form-brand-floating" aria-label="Presentacion de Comiku">
          <img className="auth-form-brand-logo" src={appIconUrl} alt="Comiku" />
        </div>

        <div className="app-hero auth-hero">
          <div>
            <h1>Bienvenido a Comiku</h1>
              <p className="auth-form-brand-copy">Descubre historias, crea tu biblioteca, comparte tu pasion por los comics.</p>

            <p className="lead">
              Crea tu cuenta o inicia sesión para ingresar al inicio de la app.
            </p>
          </div>
        </div>

        <div className="auth-switch" role="tablist" aria-label="Tipo de formulario">
          <button
            className={`switch-button ${activeForm === 'login' ? 'active' : ''}`}
            onClick={() => {
              setActiveForm('login')
              onAuthError('')
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
              onAuthError('')
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
            onAuthenticated={onAuthenticated}
            onError={onAuthError}
            onNotice={onAuthNotice}
          />
        ) : (
          <LoginPage
            onAuthenticated={onAuthenticated}
            onError={onAuthError}
          />
        )}
      </section>
    </main>
  )
}

export default AuthPage