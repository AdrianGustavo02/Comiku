import { useEffect, useState } from 'react'
import { deleteUser } from 'firebase/auth'
import { isEmailRegistered, registerWithEmail, validatePassword } from '../firebase/auth'
import { auth } from '../firebase/firebase'
import { createUserProfile, isNickRegistered } from '../firebase/user'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_PROFILE_PICTURE_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import '../styles/RegisterPage.css'

const MINIMUM_AGE = 18

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
    password: '',
    confirmPassword: '',
  })
  const [fotoPerfil, setFotoPerfil] = useState(null)
  const [fotoPerfilFileName, setFotoPerfilFileName] = useState('')
  const [fotoPerfilPreviewUrl, setFotoPerfilPreviewUrl] = useState('')
  const [defaultPreviewUrl, setDefaultPreviewUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // Cargar la preview de la foto por defecto
    const loadDefaultPreview = async () => {
      try {
        const response = await fetch(defaultProfilePicture)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        setDefaultPreviewUrl(url)
      } catch (error) {
        console.error('Error loading default profile picture:', error)
      }
    }

    loadDefaultPreview()

    return () => {
      if (fotoPerfilPreviewUrl) {
        URL.revokeObjectURL(fotoPerfilPreviewUrl)
      }
      if (defaultPreviewUrl) {
        URL.revokeObjectURL(defaultPreviewUrl)
      }
    }
  }, [fotoPerfilPreviewUrl, defaultPreviewUrl])

  const showErrorAndScrollTop = (message) => {
    onError(message)

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleFotoPerfilChange = (event) => {
    const file = event.target.files?.[0] || null
    const newPreviewUrl = file ? URL.createObjectURL(file) : ''

    if (fotoPerfilPreviewUrl) {
      URL.revokeObjectURL(fotoPerfilPreviewUrl)
    }

    setFotoPerfil(file)
    setFotoPerfilFileName(file ? file.name : '')
    setFotoPerfilPreviewUrl(newPreviewUrl)
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    onError('')
    onNotice('')

    const { nombre, apellido, nick, email, fechaCumpleanos, password, confirmPassword } =
      registerForm
    const trimmedNick = nick.trim()
    const trimmedEmail = email.trim()

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

    if (fotoPerfil) {
      if (!ALLOWED_IMAGE_TYPES.includes(fotoPerfil.type)) {
        showErrorAndScrollTop('Foto de perfil debe ser .jpg, .jpeg, .png o .webp.')
        return
      }

      if (fotoPerfil.size > MAX_PROFILE_PICTURE_SIZE_BYTES) {
        showErrorAndScrollTop('Foto de perfil demasiado pesada. Usa una imagen menor a 500 KB.')
        return
      }
    }

    const emailAlreadyRegistered = await isEmailRegistered(trimmedEmail)

    if (emailAlreadyRegistered) {
      showErrorAndScrollTop('Ese correo ya está registrado. Inicia sesión o usa otro correo.')
      return
    }

    const nickAlreadyRegistered = await isNickRegistered(trimmedNick)

    if (nickAlreadyRegistered) {
      showErrorAndScrollTop('Ese nick ya está registrado. Elige otro.')
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

    let createdAuthUser = null

    try {
      setIsSubmitting(true)

      let fotoPefilDataUrl = null
      let fotoPefilObject = null

      if (fotoPerfil) {
        // Usuario subió una foto personalizada
        fotoPefilDataUrl = await readFileAsDataUrl(fotoPerfil)
        fotoPefilObject = {
          dataUrl: fotoPefilDataUrl,
          fileName: fotoPerfil.name,
          contentType: fotoPerfil.type,
          sizeBytes: fotoPerfil.size,
        }
      } else {
        // Usuario no seleccionó foto, usar la imagen por defecto
        const response = await fetch(defaultProfilePicture)
        const blob = await response.blob()
        fotoPefilDataUrl = await readFileAsDataUrl(blob)
        fotoPefilObject = {
          dataUrl: fotoPefilDataUrl,
          fileName: 'defaultProfilePicture.png',
          contentType: 'image/png',
          sizeBytes: blob.size,
        }
      }

      const user = await registerWithEmail({ email: trimmedEmail, password })
      createdAuthUser = user

      await createUserProfile({
        uid: user.uid,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        nick: trimmedNick,
        email: trimmedEmail,
        fechaCumpleanos,
        fotoPerfil: fotoPefilObject,
      })

      setRegisterForm({
        nombre: '',
        apellido: '',
        nick: '',
        email: '',
        fechaCumpleanos: '',
        password: '',
        confirmPassword: '',
      })
      setFotoPerfil(null)
      setFotoPerfilFileName('')
      setFotoPerfilPreviewUrl('')
      
      onAuthenticated({
        user,
        notice:
          'Registro exitoso. Tu perfil fue guardado en Firestore y enviamos un correo de verificación.',
      })
    } catch (error) {
      if (createdAuthUser && auth?.currentUser?.uid === createdAuthUser.uid) {
        await deleteUser(createdAuthUser).catch(() => {})
      }

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
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFotoPerfilChange}
        disabled={isSubmitting}
      />
      {fotoPerfilFileName && (
        <p className="helper-text">Archivo seleccionado: {fotoPerfilFileName}</p>
      )}
      <div className="cover-preview-card">
        <p className="helper-text">
          {fotoPerfilFileName ? 'Tu foto de perfil' : 'Foto de perfil por defecto'}
        </p>
        <img
          className="cover-preview-image"
          src={fotoPerfilPreviewUrl || defaultPreviewUrl}
          alt="Foto de perfil"
        />
      </div>

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
