import { useEffect, useState } from 'react'
import {
  addComicVolume,
  createComic,
  isbnExists,
} from '../firebase/comics'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_COVER_SIZE_BYTES,
  readFileAsDataUrl,
} from '../constants/imageUpload'
import '../styles/ComicForm.css'

function isFormEmpty({ numeroTomo, isbn, fechaPublicacion, coverFile }) {
  return !numeroTomo && !isbn && !fechaPublicacion && !coverFile
}

function formatPublicationDate(publicationDate) {
  if (!publicationDate || !/^\d{4}-\d{2}$/.test(publicationDate)) {
    return publicationDate || 'No definida'
  }

  const [year, month] = publicationDate.split('-')
  return `${month}/${year}`
}

function CreateComicVolumesPage({ comicDraft, onBackToHome, onFinishCreation }) {
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

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl)
      }
    }
  }, [coverPreviewUrl])

  const updateCoverFile = (file) => {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl)
    }

    setCoverFile(file)
    setCoverFileName(file ? file.name : '')
    setCoverPreviewUrl(file ? URL.createObjectURL(file) : '')
  }

  const resetForm = () => {
    setMode('numero')
    setNumeroTomo('')
    setIsbn('')
    setFechaPublicacion('')
    updateCoverFile(null)
  }

  const validateForm = () => {
    if (!comicDraft) {
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

    if (!coverFile) {
      return 'Portada es obligatoria.'
    }

    if (!ALLOWED_IMAGE_TYPES.includes(coverFile.type)) {
      return 'Portada debe ser .jpg, .jpeg, .png o .webp.'
    }

    if (coverFile.size > MAX_COVER_SIZE_BYTES) {
      return 'Portada demasiado pesada. Usa una imagen menor a 500 KB.'
    }

    return ''
  }

  const buildVolumeDraft = async () => {
    const validationError = validateForm()

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

    if (!comicDraft) {
      setFormError('No se encontró el borrador del comic. Vuelve al inicio y créalo nuevamente.')
      return
    }

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

      const createdComicId = await createComic(comicDraft)

      for (const volume of finalVolumes) {
        await addComicVolume({
          comicId: createdComicId,
          numeroTomo: volume.numeroTomo,
          tomoUnico: volume.tomoUnico,
          isbn: volume.isbn,
          fechaPublicacion: volume.fechaPublicacion,
          portada: volume.portada,
        })
      }

      onFinishCreation(finalVolumes.length)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No fue posible finalizar la carga.'
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
            <button className="back-button" onClick={onBackToHome} type="button">
              Volver al inicio
            </button>
          </div>
        </div>

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
          <input
            accept=".jpg,.jpeg,.png,.webp"
            id="volume-cover"
            onChange={(event) => {
              const file = event.target.files?.[0] || null
              updateCoverFile(file)
            }}
            required
            type="file"
          />
          {coverFileName ? (
            <p className="helper-text">Archivo seleccionado: {coverFileName}</p>
          ) : null}

          {coverPreviewUrl ? (
            <div className="cover-preview-card">
              <p className="helper-text">Vista previa de portada</p>
              <img
                className="cover-preview-image"
                src={coverPreviewUrl}
                alt="Vista previa de portada"
              />
            </div>
          ) : null}

          <div className="volume-actions">
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
