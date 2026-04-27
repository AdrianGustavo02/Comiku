import { useState } from 'react'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import '../styles/Home.css'

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