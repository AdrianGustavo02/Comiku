import { useState } from 'react'
import { loginWithEmail } from '../firebase/auth'
import '../styles/LoginPage.css'

function LoginPage({ onAuthenticated, onError }) {
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    onError('')

    const { email, password } = loginForm

    if (!email || !password) {
      onError('Completa correo y contraseña.')
      return
    }

    try {
      setIsSubmitting(true)
      const user = await loginWithEmail({ email: email.trim(), password })
      setLoginForm({ email: '', password: '' })
      onAuthenticated({ user })
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'No fue posible iniciar sesion.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleLoginSubmit}>
      <label htmlFor="login-email">Correo electronico</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        value={loginForm.email}
        onChange={(event) =>
          setLoginForm((current) => ({
            ...current,
            email: event.target.value,
          }))
        }
        placeholder="tu-correo@ejemplo.com"
        disabled={isSubmitting}
      />

      <label htmlFor="login-password">Contraseña</label>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={loginForm.password}
        onChange={(event) =>
          setLoginForm((current) => ({
            ...current,
            password: event.target.value,
          }))
        }
        placeholder="Tu contraseña"
        disabled={isSubmitting}
      />

      <button
        className="login-submit"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Ingresando...' : 'Iniciar sesion'}
      </button>
    </form>
  )
}

export default LoginPage
