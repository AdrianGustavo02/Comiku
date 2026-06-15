import { useEffect, useRef, useState } from 'react'
import { deleteUser } from 'firebase/auth'
import {
  isEmailBlockedForRegistration,
  isEmailRegistered,
  registerWithEmail,
  validatePassword,
} from '../firebase/auth'
import { auth } from '../firebase/firebase'
import { createUserProfile, isNickRegistered } from '../firebase/user'
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
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import '../styles/RegisterPage.css'
import FileInput from '../Components/FileInput'
import Button from '../Components/Button'

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
    fechaNacimiento: '',
    password: '',
    confirmPassword: '',
  })
  const [fotoPerfilData, setFotoPerfilData] = useState(null)
  const [fotoPerfilFileName, setFotoPerfilFileName] = useState('')
  const [fotoPerfilPreviewUrl, setFotoPerfilPreviewUrl] = useState('')
  const [defaultPreviewUrl, setDefaultPreviewUrl] = useState('')
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [pendingFotoSrc, setPendingFotoSrc] = useState('')
  const [pendingFotoName, setPendingFotoName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const fotoInputRef = useRef(null)

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
      if (fotoPerfilPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(fotoPerfilPreviewUrl)
      }
      if (defaultPreviewUrl?.startsWith('blob:')) {
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

  const handleFotoPerfilChange = async (event) => {
    const file = event.target.files?.[0] || null

    if (!file) {
      setFotoPerfilData(null)
      setFotoPerfilFileName('')
      setFotoPerfilPreviewUrl('')
      setPendingFotoSrc('')
      setPendingFotoName('')
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showErrorAndScrollTop('Foto de perfil debe ser .jpg, .jpeg, .png o .webp.')
      if (fotoInputRef.current) fotoInputRef.current.value = ''
      return
    }

    if (file.size > MAX_PROFILE_PICTURE_SIZE_BYTES) {
      showErrorAndScrollTop('Foto de perfil demasiado pesada. Usa una imagen menor a 500 KB.')
      if (fotoInputRef.current) fotoInputRef.current.value = ''
      return
    }

    try {
      const previewUrl = await readFileAsDataUrl(file)
      setPendingFotoSrc(previewUrl)
      setPendingFotoName(file.name)
      setIsCropOpen(true)
    } catch (error) {
      showErrorAndScrollTop(
        error instanceof Error ? error.message : 'No se pudo leer la foto seleccionada.',
      )
      if (fotoInputRef.current) fotoInputRef.current.value = ''
    }
  }

  const handleCropCancel = () => {
    setIsCropOpen(false)
    setPendingFotoSrc('')
    setPendingFotoName('')
    if (fotoInputRef.current) fotoInputRef.current.value = ''
  }

  const handleCropConfirm = async (croppedDataUrl) => {
    if (!croppedDataUrl) {
      handleCropCancel()
      return
    }

    setFotoPerfilData({
      dataUrl: croppedDataUrl,
      fileName: pendingFotoName || 'foto-recortada.jpg',
    })
    setFotoPerfilFileName(pendingFotoName || 'foto-recortada.jpg')
    setFotoPerfilPreviewUrl(croppedDataUrl)
    setIsCropOpen(false)
    setPendingFotoSrc('')
    setPendingFotoName('')

    if (fotoInputRef.current) {
      fotoInputRef.current.value = ''
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    onError('')
    onNotice('')

    const { nombre, apellido, nick, email, fechaNacimiento, password, confirmPassword } =
      registerForm
    const trimmedNombre = nombre.trim()
    const trimmedApellido = apellido.trim()
    const trimmedNick = nick.trim()
    const trimmedEmail = email.trim()

    if (!trimmedNick || !trimmedEmail || !fechaNacimiento || !password || !confirmPassword) {
      showErrorAndScrollTop(
        'Completa nick, correo, fecha de cumpleaños, contraseña y confirmación.',
      )
      return
    }

    if (containsNumbers(trimmedNombre) || containsNumbers(trimmedApellido)) {
      showErrorAndScrollTop('Nombre y apellido no pueden contener números.')
      return
    }

    const age = getAgeFromDateString(fechaNacimiento)

    if (age === null) {
      showErrorAndScrollTop('Ingresa una fecha de cumpleaños válida.')
      return
    }

    if (age < MINIMUM_AGE) {
      showErrorAndScrollTop(`Debes tener al menos ${MINIMUM_AGE} años para registrarte.`)
      return
    }

    const emailIsBlocked = await isEmailBlockedForRegistration(trimmedEmail)

    if (emailIsBlocked) {
      showErrorAndScrollTop('Este correo fue bloqueado y no puede volver a registrarse.')
      return
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

      let fotoPefilObject = null

      if (fotoPerfilData) {
        const response = await fetch(fotoPerfilData.dataUrl)
        const blob = await response.blob()
        fotoPefilObject = {
          dataUrl: fotoPerfilData.dataUrl,
          fileName: fotoPerfilData.fileName,
          contentType: blob.type || 'image/jpeg',
          sizeBytes: blob.size,
        }
      } else {
        // Usuario no seleccionó foto, usar la imagen por defecto
        const response = await fetch(defaultProfilePicture)
        const blob = await response.blob()
        fotoPefilObject = {
          dataUrl: await readFileAsDataUrl(blob),
          fileName: 'defaultProfilePicture.png',
          contentType: 'image/png',
          sizeBytes: blob.size,
        }
      }

      const user = await registerWithEmail({ email: trimmedEmail, password })
      createdAuthUser = user

      await createUserProfile({
        uid: user.uid,
        nombre: trimmedNombre,
        apellido: trimmedApellido,
        nick: trimmedNick,
        email: trimmedEmail,
        fechaNacimiento,
        fotoPerfil: fotoPefilObject,
      })

      setRegisterForm({
        nombre: '',
        apellido: '',
        nick: '',
        email: '',
        fechaNacimiento: '',
        password: '',
        confirmPassword: '',
      })
      setFotoPerfilData(null)
      setFotoPerfilFileName('')
      setFotoPerfilPreviewUrl('')
      setPendingFotoSrc('')
      setPendingFotoName('')
      if (fotoInputRef.current) {
        fotoInputRef.current.value = ''
      }
      
      onAuthenticated({
        user,
        profile: {
          uid: user.uid,
          nombre: trimmedNombre,
          apellido: trimmedApellido,
          nick: trimmedNick,
          email: trimmedEmail,
          rol: 'usuario',
          fechaNacimiento,
          fotoPerfil: fotoPefilObject?.dataUrl || defaultProfilePicture,
        },
        notice: 'Registro exitoso. Tu perfil fue guardado correctamente.',
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
            nombre: sanitizeNameInput(event.target.value),
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
            apellido: sanitizeNameInput(event.target.value),
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
            nick: sanitizeForbiddenInputChars(event.target.value),
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

      <label htmlFor="register-fecha-cumpleanos">Fecha de nacimiento</label>
      <input
        id="register-fecha-cumpleanos"
        name="fechaNacimiento"
        type="date"
        value={registerForm.fechaNacimiento}
        onChange={(event) =>
          setRegisterForm((current) => ({
            ...current,
            fechaNacimiento: event.target.value,
          }))
        }
        disabled={isSubmitting}
      />

      <label htmlFor="register-foto-perfil">Foto de perfil (opcional)</label>
      <FileInput
        id="register-foto-perfil"
        name="fotoPerfil"
        accept=".jpg,.jpeg,.png,.webp"
        onFileChange={(file) => handleFotoPerfilChange({ target: { files: file ? [file] : [] } })}
        disabled={isSubmitting}
        initialFileName={fotoPerfilFileName}
      />
      <div className="cover-preview-card">
        <p className="helper-text">
          {fotoPerfilFileName ? 'Tu foto de perfil' : 'Foto de perfil por defecto'}
        </p>
        {fotoPerfilPreviewUrl || defaultPreviewUrl ? (
          <img
            className="cover-preview-image"
            src={fotoPerfilPreviewUrl || defaultPreviewUrl}
            alt="Foto de perfil"
          />
        ) : (
          <div className="cover-preview-image cover-preview-placeholder" aria-hidden="true" />
        )}
      </div>

      <label htmlFor="register-password">Contraseña</label>
      <div className="password-field">
        <input
          id="register-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
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
        <button
          type="button"
          className="password-visibility-toggle"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          disabled={isSubmitting}
        >
          {showPassword ? 'Ocultar' : 'Ver'}
        </button>
      </div>

      <label htmlFor="register-confirm-password">Confirmar contraseña</label>
      <div className="password-field">
        <input
          id="register-confirm-password"
          name="confirmPassword"
          type={showConfirmPassword ? 'text' : 'password'}
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
          type="button"
          className="password-visibility-toggle"
          onClick={() => setShowConfirmPassword((current) => !current)}
          aria-label={showConfirmPassword ? 'Ocultar confirmacion de contraseña' : 'Mostrar confirmacion de contraseña'}
          disabled={isSubmitting}
        >
          {showConfirmPassword ? 'Ocultar' : 'Ver'}
        </button>
      </div>

      <button
        className="register-submit"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Registrando...' : 'Registrarse'}
      </button>

      <ImageCropperModal
        open={isCropOpen}
        imageSrc={pendingFotoSrc}
        title="Recortar foto de perfil"
        subtitle="Ajusta la imagen antes de usarla en tu perfil."
        confirmLabel="Guardar recorte"
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </form>
  )
}

export default RegisterPage
