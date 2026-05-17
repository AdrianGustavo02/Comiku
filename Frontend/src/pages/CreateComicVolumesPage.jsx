import { useEffect, useState } from 'react'
import {
  addComicVolume,
  createComic,
  isbnExists,
  isbnExistsExcluding,
  getComicVolumeById,
  updateComicVolume,
} from '../firebase/comics'
import { auth } from '../firebase/firebase'
import { getUserProfile } from '../firebase/user'
import { addPendingCreation } from '../firebase/pendingCreations'
import FileInput from '../Components/FileInput'
import CoverPreview from '../Components/CoverPreview'
import Button from '../Components/Button'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_COVER_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import { getComicById } from '../firebase/comics'
import '../styles/ComicForm.css'

function isFormEmpty({ numeroTomo, isbn, fechaPublicacion, coverFile }) {
  return !numeroTomo && !isbn && !fechaPublicacion && !coverFile
}

function estimateVolumeDocumentSize(portadaDataUrl, metadata = {}) {
  // Estima el tamaño del documento en Firestore
  // base64 es ~33% más grande que el binario original
  const portadaSize = portadaDataUrl ? portadaDataUrl.length : 0
  const metadataSize = JSON.stringify(metadata).length
  const totalEstimatedSize = portadaSize + metadataSize
  return totalEstimatedSize
}

function formatBytesForDisplay(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

function formatPublicationDate(publicationDate) {
  if (!publicationDate || !/^\d{4}-\d{2}$/.test(publicationDate)) {
    return publicationDate || 'No definida'
  }

  const [year, month] = publicationDate.split('-')
  return `${month}/${year}`
}

function CreateComicVolumesPage({
  comicDraft,
  onBackToHome,
  onFinishCreation,
  comicId,
  volumeId,
  onVolumeUpdated,
  initialNotice,
  showComicMetadata = false,
  onCancel = null,
}) {
  const [mode, setMode] = useState('numero')
  const [numeroTomo, setNumeroTomo] = useState('')
  const [isbn, setIsbn] = useState('')
  const [fechaPublicacion, setFechaPublicacion] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverFileName, setCoverFileName] = useState('')
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('')
  const [volumesAdded, setVolumesAdded] = useState([])
  const [showAddedVolumesSummary, setShowAddedVolumesSummary] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [comicMetadata, setComicMetadata] = useState(null)
  const isExistingComicMode = showComicMetadata

  useEffect(() => {
    let cancelled = false

    setFormNotice(initialNotice || '')

    if (!showComicMetadata) {
      setComicMetadata(null)
    }

    async function loadMetadata() {
      if (!showComicMetadata || !comicId) return
      try {
        const data = await getComicById(comicId)
        if (!cancelled) setComicMetadata(data)
      } catch {
        if (!cancelled) setComicMetadata(null)
      }
    }

    loadMetadata()

    return () => {
      cancelled = true
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl)
      }
    }
  }, [coverPreviewUrl, showComicMetadata, comicId, initialNotice])

  const updateCoverFile = (file) => {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl)
    }

    setCoverFile(file)
    setCoverFileName(file ? file.name : '')
    setCoverPreviewUrl(file ? URL.createObjectURL(file) : '')
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      if (!comicId || !volumeId) return
      try {
        const data = await getComicVolumeById({ comicId, volumeId })
        if (cancelled || !data) return

        setMode(data.numeroTomo !== null ? 'numero' : 'unico')
        setNumeroTomo(data.numeroTomo !== null ? String(data.numeroTomo) : '')
        setIsbn(data.isbn !== null ? String(data.isbn) : '')
        setFechaPublicacion(data.fechaPublicacion || '')
        // portada is object with dataUrl; we won't convert to File, but show preview
        if (data.portada && data.portada.dataUrl) {
          setCoverPreviewUrl(data.portada.dataUrl)
          setCoverFileName(data.portada.fileName || '')
          setCoverFile(null)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) null
      }
    }

    loadInitial()

    return () => {
      cancelled = true
    }
  }, [comicId, volumeId])

  const resetForm = () => {
    setMode('numero')
    setNumeroTomo('')
    setIsbn('')
    setFechaPublicacion('')
    updateCoverFile(null)
  }

  const validateForm = ({ requireComicDraft = !isExistingComicMode, requireCover = true } = {}) => {
    if (requireComicDraft && !comicDraft) {
      return 'No se encontró el borrador del comic. Vuelve al inicio y créalo nuevamente.'
    }

    if (mode === 'numero') {
      if (!numeroTomo) {
        return 'Número de tomo es obligatorio cuando eliges ese modo.'
      }

      if (!/^\d+$/.test(numeroTomo)) {
        return 'Número de tomo debe contener solo números.'
      }
    }

    if (!isbn.trim()) {
      return 'Código ISBN es obligatorio.'
    }

    if (!/^\d{1,13}$/.test(isbn.trim())) {
      return 'Código ISBN debe tener solo números y máximo 13 dígitos.'
    }

    if (!fechaPublicacion) {
      return 'Fecha de publicación es obligatoria.'
    }

    if (!/^\d{4}-\d{2}$/.test(fechaPublicacion)) {
      return 'Fecha de publicación debe tener formato mes y año válido.'
    }

    if (requireCover && !coverFile) {
      return 'Portada es obligatoria.'
    }

    if (coverFile) {
      if (!ALLOWED_IMAGE_TYPES.includes(coverFile.type)) {
        return 'Portada debe ser .jpg, .jpeg, .png o .webp.'
      }

      if (coverFile.size > MAX_COVER_SIZE_BYTES) {
        return 'Portada demasiado pesada. Usa una imagen menor a 500 KB.'
      }
    }

    return ''
  }

  const buildVolumeDraft = async () => {
    const validationError = validateForm({
      requireComicDraft: !isExistingComicMode,
      requireCover: true,
    })

    if (validationError) {
      setFormError(validationError)
      return null
    }

    setFormError('')

    const isbnValue = Number.parseInt(isbn.trim(), 10)

    try {
      const isbnAlreadyExists = await isbnExists(isbnValue)
      if (isbnAlreadyExists) {
        setFormError(`El código ISBN ${isbn} ya existe en la base de datos. El ISBN debe ser único.`)
        return null
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo validar el ISBN.'
      setFormError(message)
      return null
    }

    const numeroTomoValue = mode === 'numero' ? Number.parseInt(numeroTomo, 10) : null
    const tomoUnicoValue = mode === 'unico'
    const coverDataUrl = await readFileAsDataUrl(coverFile)

    const portada = {
      dataUrl: coverDataUrl,
      fileName: coverFile.name,
      contentType: coverFile.type,
      sizeBytes: coverFile.size,
      source: 'firestore-inline',
    }

    return {
      id: `${Date.now()}-${isbnValue}-${Math.random().toString(16).slice(2)}`,
      numeroTomo: numeroTomoValue,
      tomoUnico: tomoUnicoValue,
      isbn: isbnValue,
      fechaPublicacion,
      portada,
      portadaNombre: coverFile.name,
    }
  }

  const handleContinue = async () => {
    setFormNotice('')

    try {
      setSaving(true)
      const volume = await buildVolumeDraft()

      if (!volume) {
        return
      }

      // Estimar tamaño del documento
      const estimatedSize = estimateVolumeDocumentSize(volume.portada.dataUrl, {
        NumeroTomo: volume.numeroTomo,
        TomoUnico: volume.tomoUnico,
        ISBN: volume.isbn,
        FechaPublicacion: volume.fechaPublicacion,
      })

      // Firebase límite: 1 MB por documento
      const MAX_DOCUMENT_SIZE = 1024 * 1024
      if (estimatedSize > MAX_DOCUMENT_SIZE * 0.95) {
        // 95% del límite como margen de seguridad
        const sizeDisplay = formatBytesForDisplay(estimatedSize)
        setFormError(
          `La información del tomo es demasiado pesada (${sizeDisplay}). Intenta usar una portada más comprimida.`
        )
        return
      }

      const nextVolumes = [...volumesAdded, volume]
      setVolumesAdded(nextVolumes)
      setShowAddedVolumesSummary(true)
      setFormNotice('Tomo agregado. Se guardará al finalizar la carga.')

      resetForm()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No fue posible guardar el tomo.'
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    setFormError('')
    setFormNotice('')

    const thereIsDraftData = !isFormEmpty({
      numeroTomo,
      isbn,
      fechaPublicacion,
      coverFile,
    })

    try {
      setSaving(true)
      let finalVolumes = [...volumesAdded]

      if (thereIsDraftData) {
        const volume = await buildVolumeDraft()

        if (!volume) {
          return
        }

        finalVolumes = [...finalVolumes, volume]
        setVolumesAdded(finalVolumes)
      }

      if (finalVolumes.length < 1) {
        setFormError('Debes cargar al menos un tomo para finalizar.')
        return
      }

      // Decide if we must create immediately or store as pending depending on user role
      const currentUser = auth.currentUser
      let userRole = 'usuario'

      try {
        if (currentUser?.uid) {
          const profile = await getUserProfile(currentUser.uid)
          userRole = profile?.rol || 'usuario'
        }
      } catch {
        // ignore
      }

      if (userRole && String(userRole).toLowerCase() === 'usuario') {
        // Save as pending creation instead of writing to Firestore directly
          const pendingPayload = {
            tipo: isExistingComicMode ? 'tomos' : 'comic_y_tomos',
            UserID: currentUser?.uid || null,
            metadata: isExistingComicMode ? null : comicDraft,
            comicId: isExistingComicMode ? comicId : null,
            tomos: finalVolumes,
          }

          await addPendingCreation(pendingPayload)
        setFormNotice('Creación enviada para revisión por un administrador.')
        // don't write anything yet
        if (onFinishCreation) onFinishCreation(finalVolumes.length, true)
        return
      }

      const targetComicId = isExistingComicMode ? comicId : await createComic(comicDraft)

      if (!targetComicId) {
        setFormError('No se encontró el comic para guardar los tomos.')
        return
      }

      for (const volume of finalVolumes) {
        // Estimar tamaño antes de enviar
        const estimatedSize = estimateVolumeDocumentSize(volume.portada.dataUrl, {
          NumeroTomo: volume.numeroTomo,
          TomoUnico: volume.tomoUnico,
          ISBN: volume.isbn,
          FechaPublicacion: volume.fechaPublicacion,
        })

        const MAX_DOCUMENT_SIZE = 1024 * 1024
        if (estimatedSize > MAX_DOCUMENT_SIZE * 0.95) {
          const sizeDisplay = formatBytesForDisplay(estimatedSize)
          throw new Error(
            `La información del tomo es demasiado pesada (${sizeDisplay}). Intenta usar una portada más comprimida.`
          )
        }

        await addComicVolume({
          comicId: targetComicId,
          numeroTomo: volume.numeroTomo,
          tomoUnico: volume.tomoUnico,
          isbn: volume.isbn,
          fechaPublicacion: volume.fechaPublicacion,
          portada: volume.portada,
        })
      }

      if (onFinishCreation) onFinishCreation(finalVolumes.length, false)
    } catch (error) {
      let message = error instanceof Error ? error.message : 'No fue posible finalizar la carga.'
      // Mapear errores técnicos de Firebase a mensajes amigables
      if (message.includes('Document too large') || message.includes('too large')) {
        message = 'La información del tomo es demasiado pesada. Intenta usar una portada más comprimida.'
      }
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateVolume = async () => {
    setFormError('')
    try {
      setSaving(true)

      // validate
      const validation = validateForm({
        requireComicDraft: false,
        requireCover: !coverPreviewUrl,
      })
      if (validation) {
        setFormError(validation)
        return
      }

      if (!comicId || !volumeId) {
        setFormError('No se encontraron datos del tomo para actualizar.')
        return
      }

      // decide portada payload: if coverFile is set, upload inline, else undefined to keep existing
      let portadaPayload = undefined

      if (coverFile) {
        if (!ALLOWED_IMAGE_TYPES.includes(coverFile.type)) {
          setFormError('Portada debe ser .jpg, .jpeg, .png o .webp.')
          return
        }

        if (coverFile.size > MAX_COVER_SIZE_BYTES) {
          setFormError('Portada demasiado pesada. Usa una imagen menor a 500 KB.')
          return
        }

        const coverDataUrl = await readFileAsDataUrl(coverFile)
        portadaPayload = {
          dataUrl: coverDataUrl,
          fileName: coverFile.name,
          contentType: coverFile.type,
          sizeBytes: coverFile.size,
          source: 'firestore-inline',
        }
      }

      const isbnValue = Number.parseInt(isbn.trim(), 10)

      if (isbnValue) {
        const isbnAlreadyExists = await isbnExistsExcluding(isbnValue, comicId, volumeId)
        if (isbnAlreadyExists) {
          setFormError(`El código ISBN ${isbn} ya existe en la base de datos. El ISBN debe ser único.`)
          return
        }
      }

      const numeroTomoValue = mode === 'numero' ? Number.parseInt(numeroTomo, 10) : null
      const tomoUnicoValue = mode === 'unico'

      // Estimar tamaño si se actualiza la portada
      if (portadaPayload) {
        const estimatedSize = estimateVolumeDocumentSize(portadaPayload.dataUrl, {
          NumeroTomo: numeroTomoValue,
          TomoUnico: tomoUnicoValue,
          ISBN: Number.parseInt(isbn.trim(), 10),
          FechaPublicacion: fechaPublicacion,
        })

        const MAX_DOCUMENT_SIZE = 1024 * 1024
        if (estimatedSize > MAX_DOCUMENT_SIZE * 0.95) {
          const sizeDisplay = formatBytesForDisplay(estimatedSize)
          setFormError(
            `La información del tomo es demasiado pesada (${sizeDisplay}). Intenta usar una portada más comprimida.`
          )
          return
        }
      }

      await updateComicVolume({
        comicId,
        volumeId,
        numeroTomo: numeroTomoValue,
        tomoUnico: tomoUnicoValue,
        isbn: Number.parseInt(isbn.trim(), 10),
        fechaPublicacion,
        portada: portadaPayload,
      })

      if (onVolumeUpdated) onVolumeUpdated()
    } catch (err) {
      let message = err instanceof Error ? err.message : ''
      if (!message) {
        message = 'No fue posible actualizar el tomo.'
      }
      // Mapear errores técnicos de Firebase a mensajes amigables
      if (message.includes('Document too large') || message.includes('too large')) {
        message = 'La información del tomo es demasiado pesada. Intenta usar una portada más comprimida.'
      } else if (/ERR_BLOCKED_BY_CLIENT|Failed to fetch|NetworkError/i.test(message)) {
        message = 'El navegador o una extensión está bloqueando la conexión con Firebase. Desactiva el bloqueador y vuelve a intentar.'
      }
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Comiku / Tomos</p>
            <h1>Cargar tomos</h1>
            <p className="lead">
              Agrega los tomos que quieras para este comic. La subcolección tomos
              se crea automáticamente al guardar el primer tomo.
            </p>
          </div>

          <div className="hero-actions">
            {showComicMetadata && typeof onCancel === 'function' ? (
              <button className="back-button" onClick={onCancel} type="button">
                Cancelar
              </button>
            ) : (
              <button className="back-button" onClick={onBackToHome} type="button">
                Volver al inicio
              </button>
            )}
          </div>
        </div>

        {showComicMetadata && comicMetadata ? (
          <section className="comic-detail-metadata">
            <p>
              <strong>Comic:</strong> {comicMetadata.nombre || 'Sin nombre'}
            </p>
            <p>
              <strong>Autores:</strong>{' '}
              {comicMetadata.autores.length > 0 ? comicMetadata.autores.join(', ') : 'No definidos'}
            </p>
            <p>
              <strong>Editorial:</strong> {comicMetadata.editorial || 'No definida'}
            </p>
            <p>
              <strong>País:</strong> {comicMetadata.paisEditorial || 'No definido'}
            </p>
            <p>
              <strong>Estado:</strong> {comicMetadata.estado || 'No definido'}
            </p>
            <p>
              <strong>Géneros:</strong>{' '}
              {comicMetadata.generos.length > 0 ? comicMetadata.generos.join(', ') : 'No definidos'}
            </p>
            <p>
              <strong>Formato:</strong> {comicMetadata.formato || 'No definido'}
            </p>
          </section>
        ) : null}

        {showAddedVolumesSummary ? (
          <div className="counter-chip">Tomos cargados: {volumesAdded.length}</div>
        ) : null}

        {formError ? <p className="form-message error">{formError}</p> : null}
        {formNotice ? <p className="form-message success">{formNotice}</p> : null}

        <form className="comic-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="volume-mode">Modo de carga</label>
          <select
            id="volume-mode"
            onChange={(event) => {
              const nextMode = event.target.value
              setMode(nextMode)

              if (nextMode === 'unico') {
                setNumeroTomo('')
              }
            }}
            value={mode}
          >
            <option value="numero">Número de tomo</option>
            <option value="unico">Tomo único</option>
          </select>

          {mode === 'numero' ? (
            <>
              <label htmlFor="volume-number">Número de tomo</label>
              <input
                id="volume-number"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) =>
                  setNumeroTomo(event.target.value.replace(/\D/g, ''))
                }
                type="text"
                value={numeroTomo}
              />
            </>
          ) : null}

          <label htmlFor="volume-isbn">Código ISBN</label>
          <input
            id="volume-isbn"
            inputMode="numeric"
            maxLength={13}
            onChange={(event) => setIsbn(event.target.value.replace(/\D/g, ''))}
            type="text"
            value={isbn}
          />

          <label htmlFor="volume-publication-date">Fecha de publicación</label>
          <input
            id="volume-publication-date"
            onChange={(event) => setFechaPublicacion(event.target.value)}
            required
            type="month"
            value={fechaPublicacion}
          />

          <label htmlFor="volume-cover">Portada</label>
          <FileInput
            id="volume-cover"
            accept=".jpg,.jpeg,.png,.webp"
            required={!volumeId}
            onFileChange={(file) => updateCoverFile(file)}
            disabled={saving}
            initialFileName={coverFileName}
          />

          <CoverPreview src={coverPreviewUrl} alt="Vista previa de portada" />

          <div className="volume-actions">
            {!volumeId ? (
              <>
                {mode === 'numero' ? (
                  <button
                    className="secondary-button"
                    disabled={saving}
                    onClick={handleContinue}
                    type="button"
                  >
                    {saving ? 'Guardando...' : 'Seguir agregando tomos'}
                  </button>
                ) : null}

                <button
                  className="primary-button"
                  disabled={saving}
                  onClick={handleFinalize}
                  type="button"
                >
                  {saving ? 'Guardando...' : 'Finalizar creacion'}
                </button>
              </>
            ) : (
              <button
                className="primary-button"
                disabled={saving}
                onClick={handleUpdateVolume}
                type="button"
              >
                {saving ? 'Guardando...' : 'Actualizar tomo'}
              </button>
            )}
          </div>
        </form>

        {showAddedVolumesSummary ? (
          <section className="loaded-volumes">
            <h2>Resumen de tomos cargados</h2>
            {volumesAdded.length === 0 ? (
              <p className="helper-text">Aún no cargaste tomos en esta sesión.</p>
            ) : (
              <ul>
                {volumesAdded.map((volume, index) => (
                  <li key={volume.id}>
                    <strong>Tomo {index + 1}</strong>
                    <span>
                      {volume.numeroTomo !== null
                        ? `Número: ${volume.numeroTomo}`
                        : 'Tomo único: true'}
                    </span>
                    <span>ISBN: {volume.isbn}</span>
                    <span>
                      Publicación: {formatPublicationDate(volume.fechaPublicacion)}
                    </span>
                    <span>Portada: {volume.portadaNombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default CreateComicVolumesPage
