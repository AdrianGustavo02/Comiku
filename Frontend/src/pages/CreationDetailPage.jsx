import { useEffect, useMemo, useState } from 'react'
import { COMIC_GENRES } from '../constants/comicGenres'
import { COUNTRIES } from '../constants/countries'
import {
  containsForbiddenInputChars,
  sanitizeForbiddenInputChars,
} from '../constants/forbiddenInputCharacters'
import {
  getPendingCreationById,
  approvePendingCreation,
  deletePendingCreation,
  updatePendingCreation,
} from '../firebase/pendingCreations'
import { getUserProfile } from '../firebase/user'
import { getComicById } from '../firebase/comics'
import ConfirmModal from '../Components/ConfirmModal'
import Button from '../Components/Button'
import FileInput from '../Components/FileInput'
import CoverPreview from '../Components/CoverPreview'
import { ALLOWED_IMAGE_TYPES, MAX_COVER_SIZE_BYTES, readFileAsDataUrl } from '../constants/imageUpload'
import '../styles/CreationDetail.css'
import '../styles/ComicForm.css'

const STATUS_OPTIONS = ['En curso', 'Finalizado']

function formatPendingPublicationDate(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return value || 'No definida'
  }

  const [year, month] = value.split('-')
  return `${month}-${year}`
}

function CreationDetailPage({ creationId, onBack, onApproved, onPageReady }) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [remitenteNick, setRemitenteNick] = useState('')
  const [editingVolumeIndex, setEditingVolumeIndex] = useState(null)
  const [localData, setLocalData] = useState(null)
  const [confirmingDismiss, setConfirmingDismiss] = useState(false)
  const [isComicEditOpen, setIsComicEditOpen] = useState(false)
  const [comicEditError, setComicEditError] = useState('')
  const [savingComicMetadata, setSavingComicMetadata] = useState(false)
  const [volumeEditError, setVolumeEditError] = useState('')
  const [savingVolumeMetadata, setSavingVolumeMetadata] = useState(false)
  const [volumeEditForm, setVolumeEditForm] = useState({
    mode: 'numero',
    numeroTomo: '',
    isbn: '',
    fechaPublicacion: '',
  })
  const [volumeCoverFile, setVolumeCoverFile] = useState(null)
  const [volumeCoverPreview, setVolumeCoverPreview] = useState('')
  const [volumeCoverFileName, setVolumeCoverFileName] = useState('')
  const [comicEditForm, setComicEditForm] = useState({
    nombre: '',
    autores: [''],
    editorial: '',
    paisEditorial: '',
    estado: STATUS_OPTIONS[0],
    generos: [''],
    descripcion: '',
    formato: '',
  })

  const sortedCountries = useMemo(
    () => [...COUNTRIES].sort((a, b) => a.localeCompare(b, 'es')),
    [],
  )

  const sortedGenres = useMemo(
    () => [...COMIC_GENRES].sort((a, b) => a.localeCompare(b, 'es')),
    [],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await getPendingCreationById(creationId)

        if (cancelled) return

        // intentar resolver nick del remitente
        if (data?.UserID) {
          try {
            const profile = await getUserProfile(data.UserID)
            setRemitenteNick(profile?.nick || '')
          } catch {
            setRemitenteNick('')
          }
        }

        // preparar localData y si es tipo 'tomos' intentar rellenar metadata desde comicId
        const copy = JSON.parse(JSON.stringify(data || {}))
        if (!copy.metadata && copy.tipo === 'tomos' && copy.comicId) {
          try {
            const comic = await getComicById(copy.comicId)
            if (comic) {
              copy.metadata = {
                nombre: comic.nombre || '',
                autores: comic.autores || [],
                editorial: comic.editorial || '',
                paisEditorial: comic.paisEditorial || '',
                estado: comic.estado || '',
                generos: comic.generos || [],
                descripcion: comic.descripcion || '',
                formato: comic.formato || '',
              }
            }
          } catch {
            // ignore
          }
        }

        setItem(data)
        setLocalData(copy)
      } catch {
        if (!cancelled) setError('No fue posible cargar la creación.')
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    load()

    return () => { cancelled = true }
  }, [creationId])

  const handleApprove = async () => {
    try {
      setLoading(true)
      await approvePendingCreation(creationId)
      if (onApproved) onApproved()
      // Confirmation handled by parent via `onApproved`
    } catch (err) {
      const message = err && err.message ? err.message : 'No fue posible aprobar la creación.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = async () => {
    try {
      await deletePendingCreation(creationId)
      setConfirmingDismiss(false)
      if (onBack) onBack()
    } catch {
      setError('No fue posible desestimar la creación.')
    }
  }

  const handleVolumeEditOpen = (index) => {
    const tomo = localData?.tomos?.[index]

    if (!tomo) return

    setVolumeEditForm({
      mode: tomo.tomoUnico ? 'unico' : 'numero',
      numeroTomo: tomo.numeroTomo !== null && tomo.numeroTomo !== undefined ? String(tomo.numeroTomo) : '',
      isbn: tomo.isbn !== null && tomo.isbn !== undefined ? String(tomo.isbn) : '',
      fechaPublicacion: tomo.fechaPublicacion || '',
    })
    // portada: mostrar preview si existe
    if (tomo.portada && tomo.portada.dataUrl) {
      setVolumeCoverPreview(tomo.portada.dataUrl)
      setVolumeCoverFileName(tomo.portada.fileName || '')
      setVolumeCoverFile(null)
    } else {
      setVolumeCoverPreview('')
      setVolumeCoverFileName('')
      setVolumeCoverFile(null)
    }
    setVolumeEditError('')
    setEditingVolumeIndex(index)
  }

  const closeVolumeEditModal = () => {
    if (savingVolumeMetadata) return
    setVolumeEditError('')
    // limpiar preview temporal
    if (volumeCoverPreview && volumeCoverFile) {
      try { URL.revokeObjectURL(volumeCoverPreview) } catch (e) { void e }
    }
    setVolumeCoverFile(null)
    setVolumeCoverPreview('')
    setVolumeCoverFileName('')
    setEditingVolumeIndex(null)
  }

  const validateVolumeForm = (formData) => {
    if (formData.mode === 'numero') {
      if (!formData.numeroTomo) {
        return 'Número de tomo es obligatorio cuando eliges ese modo.'
      }

      if (!/^\d+$/.test(formData.numeroTomo)) {
        return 'Número de tomo debe contener solo números.'
      }
    }

    if (!formData.isbn.trim()) {
      return 'Código ISBN es obligatorio.'
    }

    if (!/^\d{1,13}$/.test(formData.isbn.trim())) {
      return 'Código ISBN debe tener solo números y máximo 13 dígitos.'
    }

    if (!formData.fechaPublicacion) {
      return 'Fecha de publicación es obligatoria.'
    }

    if (!/^\d{4}-\d{2}$/.test(formData.fechaPublicacion)) {
      return 'Fecha de publicación debe tener formato mes y año válido.'
    }

    return ''
  }

  const handleSaveVolumeMetadata = async () => {
    const validationMessage = validateVolumeForm(volumeEditForm)

    if (validationMessage) {
      setVolumeEditError(validationMessage)
      return
    }

    if (editingVolumeIndex === null || editingVolumeIndex === undefined) {
      setVolumeEditError('No se encontró el tomo a editar.')
      return
    }

    const updatedVolumes = Array.isArray(localData?.tomos) ? [...localData.tomos] : []
    const currentVolume = updatedVolumes[editingVolumeIndex]

    if (!currentVolume) {
      setVolumeEditError('No se encontró el tomo a editar.')
      return
    }

    const updatedVolume = {
      ...currentVolume,
      numeroTomo: volumeEditForm.mode === 'numero'
        ? Number.parseInt(volumeEditForm.numeroTomo, 10)
        : null,
      tomoUnico: volumeEditForm.mode === 'unico',
      isbn: Number.parseInt(volumeEditForm.isbn.trim(), 10),
      fechaPublicacion: volumeEditForm.fechaPublicacion,
    }

    // manejar portada: si se seleccionó un archivo, convertir a dataUrl e incluirlo
    try {
      if (volumeCoverFile) {
        if (!ALLOWED_IMAGE_TYPES.includes(volumeCoverFile.type)) {
          setVolumeEditError('La portada debe ser .jpg, .jpeg, .png o .webp.')
          return
        }

        if (volumeCoverFile.size > MAX_COVER_SIZE_BYTES) {
          setVolumeEditError('La portada es demasiado pesada. Usa una imagen menor a 500 KB.')
          return
        }

        const coverDataUrl = await readFileAsDataUrl(volumeCoverFile)
        updatedVolume.portada = {
          dataUrl: coverDataUrl,
          fileName: volumeCoverFile.name,
          contentType: volumeCoverFile.type,
          sizeBytes: volumeCoverFile.size,
          source: 'firestore-inline',
        }
      } else {
        // si no se seleccionó nuevo archivo, mantener la portada existente (si la hay)
        updatedVolume.portada = currentVolume.portada || null
      }
    } catch (err) {
      setVolumeEditError(err instanceof Error ? err.message : 'No fue posible procesar la portada.')
      return
    }

    updatedVolumes[editingVolumeIndex] = updatedVolume

    try {
      setSavingVolumeMetadata(true)
      setVolumeEditError('')

      await updatePendingCreation(creationId, { tomos: updatedVolumes })

      setLocalData((current) => ({
        ...current,
        tomos: updatedVolumes,
      }))

      setEditingVolumeIndex(null)
    } catch (editError) {
      const message = editError instanceof Error
        ? editError.message
        : 'No fue posible actualizar los datos del tomo pendiente.'
      setVolumeEditError(message)
    } finally {
      setSavingVolumeMetadata(false)
    }
  }

  const validateComicMetadataForm = (formData) => {
    const requiredTextFields = [
      { label: 'Nombre', value: formData.nombre },
      { label: 'Editorial', value: formData.editorial },
      { label: 'Descripción', value: formData.descripcion },
      { label: 'Formato', value: formData.formato },
    ]

    for (const field of requiredTextFields) {
      if (!field.value.trim()) {
        return `${field.label} es obligatorio.`
      }

      if (containsForbiddenInputChars(field.value)) {
        return `${field.label} contiene caracteres no permitidos.`
      }
    }

    if (!formData.paisEditorial) {
      return 'Selecciona el país de la editorial.'
    }

    const cleanAuthors = formData.autores
      .map((author) => author.trim())
      .filter(Boolean)

    if (cleanAuthors.length < 1) {
      return 'Ingresa al menos un autor.'
    }

    for (const author of cleanAuthors) {
      if (containsForbiddenInputChars(author)) {
        return 'Un autor contiene caracteres no permitidos.'
      }
    }

    const cleanGenres = formData.generos
      .map((genre) => genre.trim())
      .filter(Boolean)

    if (cleanGenres.length < 1) {
      return 'Selecciona al menos un género.'
    }

    return ''
  }

  const openComicEditModal = () => {
    const metadata = localData?.metadata || {}
    setComicEditForm({
      nombre: metadata.nombre || '',
      autores: Array.isArray(metadata.autores) && metadata.autores.length > 0 ? metadata.autores : [''],
      editorial: metadata.editorial || '',
      paisEditorial: metadata.paisEditorial || '',
      estado: metadata.estado || STATUS_OPTIONS[0],
      generos: Array.isArray(metadata.generos) && metadata.generos.length > 0 ? metadata.generos : [''],
      descripcion: metadata.descripcion || '',
      formato: metadata.formato || '',
    })
    setComicEditError('')
    setIsComicEditOpen(true)
  }

  const closeComicEditModal = () => {
    if (savingComicMetadata) return
    setComicEditError('')
    setIsComicEditOpen(false)
  }

  const updateAuthor = (index, value) => {
    setComicEditForm((current) => ({
      ...current,
      autores: current.autores.map((author, currentIndex) =>
        currentIndex === index ? value : author,
      ),
    }))
  }

  const updateGenre = (index, value) => {
    setComicEditForm((current) => ({
      ...current,
      generos: current.generos.map((genre, currentIndex) =>
        currentIndex === index ? value : genre,
      ),
    }))
  }

  const removeAuthor = (index) => {
    setComicEditForm((current) => ({
      ...current,
      autores: current.autores.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  const removeGenre = (index) => {
    setComicEditForm((current) => ({
      ...current,
      generos: current.generos.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  const handleSaveComicMetadata = async () => {
    const validationMessage = validateComicMetadataForm(comicEditForm)

    if (validationMessage) {
      setComicEditError(validationMessage)
      return
    }

    const updatedMetadata = {
      nombre: comicEditForm.nombre.trim(),
      autores: comicEditForm.autores.map((author) => author.trim()).filter(Boolean),
      editorial: comicEditForm.editorial.trim(),
      paisEditorial: comicEditForm.paisEditorial,
      estado: comicEditForm.estado,
      generos: comicEditForm.generos.map((genre) => genre.trim()).filter(Boolean),
      descripcion: comicEditForm.descripcion.trim(),
      formato: comicEditForm.formato.trim(),
    }

    try {
      setSavingComicMetadata(true)
      setComicEditError('')

      await updatePendingCreation(creationId, { metadata: updatedMetadata })

      setLocalData((current) => ({
        ...current,
        metadata: updatedMetadata,
      }))

      setError('')
      setIsComicEditOpen(false)
    } catch (editError) {
      const message = editError instanceof Error
        ? editError.message
        : 'No fue posible actualizar los datos del comic pendiente.'
      setComicEditError(message)
    } finally {
      setSavingComicMetadata(false)
    }
  }

  if (loading) return <main className="app-shell"><section className="app-card loading-card"><p className="status-message">Cargando detalles de creacion...</p></section></main>

  if (!item) return <main className="app-shell"><section className="app-card"><p className="status-message">No se encontró la creación.</p></section></main>

  return (
    <main className="app-shell creations-review-page">
      <section className="app-card creations-review-page-card">
        <div className="creation-page-hero">
          <div>
            <h1>{item.tipo === 'tomos' ? 'Tomos' : 'Comic y tomos'}</h1>
            <p className="">Enviado por: {remitenteNick || item.UserID || item.remitenteUid}</p>
          </div>
        </div>

        <section className="comic-detail-metadata">
          <p><strong>Comic:</strong> {localData.metadata?.nombre || 'Sin nombre'}</p>
          <p><strong>Autores:</strong> {localData.metadata?.autores?.join(', ') || 'No definidos'}</p>
          <p><strong>Editorial:</strong> {localData.metadata?.editorial || 'No definida'}</p>
          <p><strong>País:</strong> {localData.metadata?.paisEditorial || 'No definido'}</p>
          <p><strong>Estado:</strong> {localData.metadata?.estado || 'No definido'}</p>
          <p><strong>Géneros:</strong> {localData.metadata?.generos?.join(', ') || 'No definidos'}</p>
          <p><strong>Descripción:</strong> {localData.metadata?.descripcion || 'Sin descripción'}</p>
          <p><strong>Formato:</strong> {localData.metadata?.formato || 'No definido'}</p>
          {item.tipo === 'comic_y_tomos' ? (
            <div>
              <Button className="secondary-button" onClick={openComicEditModal} type="button" variant="secondary">
                Editar datos de comic
              </Button>
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="form-message error" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
        ) : null}

        <section>
          <h2>Tomos</h2>
          {Array.isArray(localData.tomos) && localData.tomos.length > 0 ? (
            <div className="creation-detail-tomos">
              {localData.tomos.map((tomo, idx) => (
                <article className="creation-detail-tomo-card" key={idx}>
                  <p><strong>ISBN:</strong> {tomo.isbn}</p>
                  <p><strong>Numero:</strong> {tomo.numeroTomo ?? 'Tomo único'}</p>
                  <p><strong>Publicación:</strong> {formatPendingPublicationDate(tomo.fechaPublicacion)}</p>
                  <img className="creation-detail-cover" src={tomo.portada?.dataUrl} alt={`Portada ${idx + 1}`} />
                  <div>
                    <Button className="secondary-button" onClick={() => handleVolumeEditOpen(idx)} variant="secondary">Editar datos</Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>No hay tomos.</p>
          )}
        </section>

        <div className="creation-detail-actions creation-detail-main-actions">
          <Button className="secondary-button" onClick={onBack} variant="secondary">Cancelar</Button>
          <Button className="primary-button" onClick={handleApprove} variant="primary">Aprobar creación</Button>
          <Button className="danger-button" onClick={() => setConfirmingDismiss(true)} variant="danger">Desestimar</Button>
        </div>
        {confirmingDismiss ? (
          <ConfirmModal
            title="Desestimar creación"
            message="¿Desestimar creación? Esta acción es irreversible."
            onCancel={() => setConfirmingDismiss(false)}
            onConfirm={handleDismiss}
          />
        ) : null}

        {isComicEditOpen ? (
          <div className="modal-backdrop creation-detail-modal" role="presentation" onClick={closeComicEditModal} style={{ overflowY: 'auto' }}>
            <section className="app-card creation-detail-modal-card creation-detail-modal-card-comic" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="app-hero">
                <div>
                  <h2>Editar datos de comic</h2>
                </div>
              </div>

              {comicEditError ? <p className="form-message error">{comicEditError}</p> : null}

              <div className="comic-form">
                <label htmlFor="pending-comic-name">Nombre</label>
                <input
                  id="pending-comic-name"
                  maxLength={120}
                  onChange={(event) => setComicEditForm((current) => ({ ...current, nombre: sanitizeForbiddenInputChars(event.target.value) }))}
                  type="text"
                  value={comicEditForm.nombre}
                />

                <fieldset className="dynamic-group">
                  <legend>Autor o autores</legend>
                  {comicEditForm.autores.map((author, index) => (
                    <div className="dynamic-row" key={`pending-autor-${index + 1}`}>
                      <input
                        maxLength={100}
                        onChange={(event) => updateAuthor(index, sanitizeForbiddenInputChars(event.target.value))}
                        placeholder={`Autor ${index + 1}`}
                        required={index === 0}
                        type="text"
                        value={author}
                      />
                      <Button className="small-button" disabled={comicEditForm.autores.length === 1} onClick={() => removeAuthor(index)} type="button" variant="secondary">
                        Quitar
                      </Button>
                    </div>
                  ))}
                  <Button className="small-button secondary" onClick={() => setComicEditForm((current) => ({ ...current, autores: [...current.autores, ''] }))} type="button" variant="secondary">
                    Agregar autor
                  </Button>
                </fieldset>

                <label htmlFor="pending-comic-editorial">Editorial</label>
                <input
                  id="pending-comic-editorial"
                  maxLength={120}
                  onChange={(event) => setComicEditForm((current) => ({ ...current, editorial: sanitizeForbiddenInputChars(event.target.value) }))}
                  type="text"
                  value={comicEditForm.editorial}
                />

                <label htmlFor="pending-comic-country">País de editorial</label>
                <select
                  id="pending-comic-country"
                  onChange={(event) => setComicEditForm((current) => ({ ...current, paisEditorial: event.target.value }))}
                  value={comicEditForm.paisEditorial}
                >
                  <option value="">Selecciona un país</option>
                  {sortedCountries.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>

                <label htmlFor="pending-comic-status">Estado</label>
                <select
                  id="pending-comic-status"
                  onChange={(event) => setComicEditForm((current) => ({ ...current, estado: event.target.value }))}
                  value={comicEditForm.estado}
                >
                  {STATUS_OPTIONS.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>

                <fieldset className="dynamic-group">
                  <legend>Género o géneros</legend>
                  {comicEditForm.generos.map((genre, index) => (
                    <div className="dynamic-row" key={`pending-genre-${index + 1}`}>
                      <select onChange={(event) => updateGenre(index, event.target.value)} value={genre}>
                        <option value="">Selecciona un género</option>
                        {sortedGenres.map((genreOption) => (
                          <option key={genreOption} value={genreOption}>{genreOption}</option>
                        ))}
                      </select>
                      <Button className="small-button" disabled={comicEditForm.generos.length === 1} onClick={() => removeGenre(index)} type="button" variant="secondary">
                        Quitar
                      </Button>
                    </div>
                  ))}
                  <Button className="small-button secondary" onClick={() => setComicEditForm((current) => ({ ...current, generos: [...current.generos, ''] }))} type="button" variant="secondary">
                    Agregar género
                  </Button>
                </fieldset>

                <label htmlFor="pending-comic-description">Descripción</label>
                <textarea
                  id="pending-comic-description"
                  maxLength={1000}
                  onChange={(event) => setComicEditForm((current) => ({ ...current, descripcion: sanitizeForbiddenInputChars(event.target.value) }))}
                  rows={4}
                  value={comicEditForm.descripcion}
                />

                <label htmlFor="pending-comic-format">Formato</label>
                <input
                  id="pending-comic-format"
                  maxLength={120}
                  onChange={(event) => setComicEditForm((current) => ({ ...current, formato: sanitizeForbiddenInputChars(event.target.value) }))}
                  type="text"
                  value={comicEditForm.formato}
                />
              </div>

              <div className="creation-detail-actions">
                <Button className="secondary-button" onClick={closeComicEditModal} type="button" variant="secondary" disabled={savingComicMetadata}>
                  Cancelar
                </Button>
                <Button className="primary-button" onClick={handleSaveComicMetadata} type="button" variant="primary" disabled={savingComicMetadata}>
                  {savingComicMetadata ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </section>
          </div>
        ) : null}

        {editingVolumeIndex !== null ? (
          <div className="modal-backdrop creation-detail-modal" role="presentation" onClick={closeVolumeEditModal} style={{ overflowY: 'auto' }}>
            <section className="app-card creation-detail-modal-card creation-detail-modal-card-volume" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="app-hero">
                <div>
                  <h2>Editar datos del tomo</h2>
                </div>
              </div>

              {volumeEditError ? <p className="form-message error">{volumeEditError}</p> : null}

              <div className="comic-form">
                <label htmlFor="pending-volume-mode">Modo de tomo</label>
                <select
                  id="pending-volume-mode"
                  onChange={(event) => setVolumeEditForm((current) => ({ ...current, mode: event.target.value }))}
                  value={volumeEditForm.mode}
                >
                  <option value="numero">Numerado</option>
                  <option value="unico">Tomo único</option>
                </select>

                {volumeEditForm.mode === 'numero' ? (
                  <>
                    <label htmlFor="pending-volume-number">Número de tomo</label>
                    <input
                      id="pending-volume-number"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => setVolumeEditForm((current) => ({ ...current, numeroTomo: event.target.value.replace(/[^\d]/g, '') }))}
                      type="text"
                      value={volumeEditForm.numeroTomo}
                    />
                  </>
                ) : null}

                <label htmlFor="pending-volume-isbn">Código ISBN</label>
                <input
                  id="pending-volume-isbn"
                  inputMode="numeric"
                  maxLength={13}
                  onChange={(event) => setVolumeEditForm((current) => ({ ...current, isbn: event.target.value.replace(/[^\d]/g, '') }))}
                  type="text"
                  value={volumeEditForm.isbn}
                />

                <label htmlFor="pending-volume-date">Fecha de publicación</label>
                <input
                  id="pending-volume-date"
                  onChange={(event) => setVolumeEditForm((current) => ({ ...current, fechaPublicacion: event.target.value }))}
                  type="month"
                  value={volumeEditForm.fechaPublicacion}
                />
                <label htmlFor="pending-volume-cover">Portada</label>
                <FileInput
                  id="pending-volume-cover"
                  accept=".jpg,.jpeg,.png,.webp"
                  required={false}
                  onFileChange={(file) => {
                    if (volumeCoverPreview && volumeCoverFile) {
                      try { URL.revokeObjectURL(volumeCoverPreview) } catch (e) { void e }
                    }

                    if (file) {
                      setVolumeCoverFile(file)
                      setVolumeCoverFileName(file.name)
                      setVolumeCoverPreview(URL.createObjectURL(file))
                    } else {
                      setVolumeCoverFile(null)
                      setVolumeCoverFileName('')
                      setVolumeCoverPreview('')
                    }
                  }}
                  disabled={savingVolumeMetadata}
                  initialFileName={volumeCoverFileName}
                />

                <CoverPreview src={volumeCoverPreview} alt="Vista previa de portada" />
              </div>

              <div className="creation-detail-actions">
                <Button className="secondary-button" onClick={closeVolumeEditModal} type="button" variant="secondary" disabled={savingVolumeMetadata}>
                  Cancelar
                </Button>
                <Button className="primary-button" onClick={handleSaveVolumeMetadata} type="button" variant="primary" disabled={savingVolumeMetadata}>
                  {savingVolumeMetadata ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default CreationDetailPage
