import { useState } from 'react'
import { isEmailRegistered, registerWithEmail, validatePassword } from '../firebase/auth'
import { createUserProfile } from '../firebase/user'
import '../styles/RegisterPage.css'

const MINIMUM_AGE = 18

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getAgeFromDateString(dateString) {
  const birthDate = new Date(`${dateString}T00:00:00`)

  if (Number.isNaN(birthDate.getTime())) {
    return null
  }

  const now = new Date()
  let age = now.getFullYear() - birthDate.getFullYear()
  const hasNotHadBirthdayYetThisYear =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate())

  if (hasNotHadBirthdayYetThisYear) {
    age -= 1
  }

  return age
}

function RegisterPage({ onAuthenticated, onError, onNotice }) {
  const [registerForm, setRegisterForm] = useState({
    nombre: '',
    apellido: '',
    nick: '',
    email: '',
    fechaCumpleanos: '',
    fotoPerfil: '',
    password: '',
    confirmPassword: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const showErrorAndScrollTop = (message) => {
    onError(message)

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    onError('')
    onNotice('')

    const {
      nombre,
      apellido,
      nick,
      email,
      fechaCumpleanos,
      fotoPerfil,
      password,
      confirmPassword,
    } = registerForm
    const trimmedNick = nick.trim()
    const trimmedEmail = email.trim()
    const trimmedFotoPerfil = fotoPerfil.trim()

    if (!trimmedNick || !trimmedEmail || !fechaCumpleanos || !password || !confirmPassword) {
      showErrorAndScrollTop(
        'Completa nick, correo, fecha de cumpleaños, contraseña y confirmación.',
      )
      return
    }

    const age = getAgeFromDateString(fechaCumpleanos)

    if (age === null) {
      showErrorAndScrollTop('Ingresa una fecha de cumpleaños válida.')
      return
    }

    if (age < MINIMUM_AGE) {
      showErrorAndScrollTop(`Debes tener al menos ${MINIMUM_AGE} años para registrarte.`)
      return
    }

    if (trimmedFotoPerfil && !isValidHttpUrl(trimmedFotoPerfil)) {
      showErrorAndScrollTop(
        'La foto de perfil debe ser una URL válida que comience con http o https.',
      )
      return
    }

    const emailAlreadyRegistered = await isEmailRegistered(trimmedEmail)

    if (emailAlreadyRegistered) {
      showErrorAndScrollTop('Ese correo ya está registrado. Inicia sesión o usa otro correo.')
      return
    }

    if (password !== confirmPassword) {
      showErrorAndScrollTop('La confirmacion de contraseña no coincide.')
      return
    }

    const passwordValidation = validatePassword(password)

    if (!passwordValidation.valid) {
      showErrorAndScrollTop(passwordValidation.message)
      return
    }

    try {
      setIsSubmitting(true)
      const user = await registerWithEmail({ email: trimmedEmail, password })

      await createUserProfile({
        uid: user.uid,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        nick: trimmedNick,
        email: trimmedEmail,
        fechaCumpleanos,
        fotoPerfil: trimmedFotoPerfil,
      })

      setRegisterForm({
        nombre: '',
        apellido: '',
        nick: '',
        email: '',
        fechaCumpleanos: '',
        fotoPerfil: '',
        password: '',
        confirmPassword: '',
      })
      onAuthenticated({
        user,
        notice:
          'Registro exitoso. Tu perfil fue guardado en Firestore y enviamos un correo de verificación.',
      })
    } catch (error) {
      showErrorAndScrollTop(
        error instanceof Error ? error.message : 'No fue posible completar el registro.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="register-form" onSubmit={handleRegisterSubmit}>
      <label htmlFor="register-nombre">Nombre (opcional)</label>
      <input
        id="register-nombre"
        name="nombre"
        type="text"
        autoComplete="given-name"
        value={registerForm.nombre}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            nombre: event.target.value,
          }))
        }
        placeholder="Tu nombre"
        disabled={isSubmitting}
      />

      <label htmlFor="register-apellido">Apellido (opcional)</label>
      <input
        id="register-apellido"
        name="apellido"
        type="text"
        autoComplete="family-name"
        value={registerForm.apellido}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            apellido: event.target.value,
          }))
        }
        placeholder="Tu apellido"
        disabled={isSubmitting}
      />

      <label htmlFor="register-nick">Nick</label>
      <input
        id="register-nick"
        name="nick"
        type="text"
        autoComplete="nickname"
        value={registerForm.nick}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            nick: event.target.value,
          }))
        }
        placeholder="Tu nick"
        disabled={isSubmitting}
      />

      <label htmlFor="register-email">Correo electronico</label>
      <input
        id="register-email"
        name="email"
        type="email"
        autoComplete="email"
        value={registerForm.email}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            email: event.target.value,
          }))
        }
        placeholder="tu-correo@ejemplo.com"
        disabled={isSubmitting}
      />

      <label htmlFor="register-fecha-cumpleanos">Fecha de cumpleaños</label>
      <input
        id="register-fecha-cumpleanos"
        name="fechaCumpleanos"
        type="date"
        value={registerForm.fechaCumpleanos}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            fechaCumpleanos: event.target.value,
          }))
        }
        disabled={isSubmitting}
      />

      <label htmlFor="register-foto-perfil">Foto de perfil (opcional)</label>
      <input
        id="register-foto-perfil"
        name="fotoPerfil"
        type="text"
        autoComplete="photo"
        value={registerForm.fotoPerfil}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            fotoPerfil: event.target.value,
          }))
        }
        placeholder="URL de la foto de perfil"
        disabled={isSubmitting}
      />

      <label htmlFor="register-password">Contraseña</label>
      <input
        id="register-password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={registerForm.password}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            password: event.target.value,
          }))
        }
        placeholder="Minimo 6 caracteres y 1 numero"
        disabled={isSubmitting}
      />

      <label htmlFor="register-confirm-password">Confirmar contraseña</label>
      <input
        id="register-confirm-password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={registerForm.confirmPassword}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            confirmPassword: event.target.value,
          }))
        }
        placeholder="Repite la contraseña"
        disabled={isSubmitting}
      />

      <button
        className="register-submit"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Registrando...' : 'Registrarse'}
      </button>
    </form>
  )
}

export default RegisterPage
