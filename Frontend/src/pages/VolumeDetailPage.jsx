import { useEffect, useMemo, useState } from 'react'
import { getComicById, getComicVolumeById } from '../firebase/comics'
import {
  addVolumeReading,
  deleteVolumeReading,
  getLibraryVolumeData,
  getVolumeMembership,
  toggleVolumeInLibrary,
  toggleVolumeInWishlist,
} from '../firebase/volumeLists'
import '../styles/VolumeDetailPage.css'

function formatPublicationDate(publicationDate) {
  if (!publicationDate || !/^\d{4}-\d{2}$/.test(publicationDate)) {
    return publicationDate || 'No definida'
  }

  const [year, month] = publicationDate.split('-')
  return `${month}/${year}`
}

function formatReadingDate(readingDate) {
  if (!(readingDate instanceof Date)) {
    return 'Fecha no definida'
  }

  return readingDate.toLocaleDateString('es-AR')
}

function VolumeDetailPage({ comicId, volumeId, authUser }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comic, setComic] = useState(null)
  const [volume, setVolume] = useState(null)
  const [listError, setListError] = useState('')
  const [listNotice, setListNotice] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [isUpdatingLibrary, setIsUpdatingLibrary] = useState(false)
  const [isUpdatingWishlist, setIsUpdatingWishlist] = useState(false)
  const [isAddingReading, setIsAddingReading] = useState(false)
  const [readingDate, setReadingDate] = useState('')
  const [readingToDelete, setReadingToDelete] = useState(null)
  const [membership, setMembership] = useState({
    inLibrary: false,
    inWishlist: false,
  })
  const [libraryData, setLibraryData] = useState({
    inLibrary: false,
    leido: false,
    fechaLectura: [],
    readingEntries: [],
  })

  const safeReadingEntries = Array.isArray(libraryData.readingEntries)
    ? libraryData.readingEntries
    : []

  const sortedReadings = useMemo(
    () =>
      [...safeReadingEntries].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [safeReadingEntries],
  )

  useEffect(() => {
    let cancelled = false

    async function loadVolumeDetail() {
      if (!comicId || !volumeId) {
        setError('No se encontró el tomo solicitado.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const [comicData, volumeData] = await Promise.all([
          getComicById(comicId),
          getComicVolumeById({ comicId, volumeId }),
        ])

        if (cancelled) {
          return
        }

        if (!comicData || !volumeData) {
          setError('El tomo solicitado no existe o fue eliminado.')
          setComic(null)
          setVolume(null)
          return
        }

        setComic(comicData)
        setVolume(volumeData)
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el detalle del tomo.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadVolumeDetail()

    return () => {
      cancelled = true
    }
  }, [comicId, volumeId])

  useEffect(() => {
    let cancelled = false

    async function loadMembership() {
      if (!authUser?.uid || !comicId || !volumeId) {
        if (!cancelled) {
          setMembership({ inLibrary: false, inWishlist: false })
          setLibraryData({
            inLibrary: false,
            leido: false,
            fechaLectura: [],
            readingEntries: [],
          })
          setListLoading(false)
        }
        return
      }

      try {
        setListLoading(true)
        setListError('')

        const [nextMembership, nextLibraryData] = await Promise.all([
          getVolumeMembership({
            uid: authUser.uid,
            comicId,
            volumeId,
          }),
          getLibraryVolumeData({
            uid: authUser.uid,
            comicId,
            volumeId,
          }),
        ])

        if (!cancelled) {
          setMembership(nextMembership)
          setLibraryData(nextLibraryData)
        }
      } catch (requestError) {
        if (!cancelled) {
          setListError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar tu biblioteca y deseados.',
          )
        }
      } finally {
        if (!cancelled) {
          setListLoading(false)
        }
      }
    }

    loadMembership()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, comicId, volumeId])

  const handleToggleLibrary = async () => {
    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    try {
      setIsUpdatingLibrary(true)
      setListError('')
      setListNotice('')

      const nextMembership = await toggleVolumeInLibrary({
        uid: authUser.uid,
        comicId,
        volumeId,
      })

      setMembership(nextMembership)

      if (!nextMembership.inLibrary) {
        setLibraryData({
          inLibrary: false,
          leido: false,
          fechaLectura: [],
          readingEntries: [],
        })
      }

      setListNotice(
        nextMembership.inLibrary
          ? 'El tomo fue agregado a tu biblioteca.'
          : 'El tomo fue removido de tu biblioteca.',
      )
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible actualizar tu biblioteca.',
      )
    } finally {
      setIsUpdatingLibrary(false)
    }
  }

  const handleToggleWishlist = async () => {
    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    try {
      setIsUpdatingWishlist(true)
      setListError('')
      setListNotice('')

      const nextMembership = await toggleVolumeInWishlist({
        uid: authUser.uid,
        comicId,
        volumeId,
      })

      setMembership(nextMembership)

      setListNotice(
        nextMembership.inWishlist
          ? 'El tomo fue agregado a tu lista de deseados.'
          : 'El tomo fue removido de tu lista de deseados.',
      )
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible actualizar tu lista de deseados.',
      )
    } finally {
      setIsUpdatingWishlist(false)
    }
  }

  const handleAddReading = async (event) => {
    event.preventDefault()

    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    if (!membership.inLibrary) {
      setListError('Primero debes agregar el tomo a tu biblioteca.')
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(readingDate)) {
      setListError('Debes seleccionar una fecha válida.')
      return
    }

    const [year, month, day] = readingDate.split('-').map(Number)
    const readingDateValue = new Date(year, month - 1, day)

    try {
      setIsAddingReading(true)
      setListError('')
      setListNotice('')

      const nextLibraryData = await addVolumeReading({
        uid: authUser.uid,
        comicId,
        volumeId,
        readingDate: readingDateValue,
      })

      setLibraryData(nextLibraryData)
      setMembership((current) => ({
        ...current,
        inLibrary: true,
      }))
      setReadingDate('')
      setListNotice('La lectura fue guardada correctamente.')
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible guardar la lectura.',
      )
    } finally {
      setIsAddingReading(false)
    }
  }

  const handleDeleteReading = async (readingEntry) => {
    if (!authUser?.uid || !comicId || !volumeId) {
      setListError('No hay sesión activa o faltan datos del tomo.')
      return
    }

    setReadingToDelete(readingEntry)
  }

  const confirmDeleteReading = async () => {
    if (!readingToDelete || !authUser?.uid || !comicId || !volumeId) {
      setReadingToDelete(null)
      return
    }

    try {
      setIsAddingReading(true)
      setListError('')
      setListNotice('')

      const nextLibraryData = await deleteVolumeReading({
        uid: authUser.uid,
        comicId,
        volumeId,
        storageIndex: readingToDelete.storageIndex,
      })

      setLibraryData(nextLibraryData)
      setListNotice('La lectura fue eliminada correctamente.')
    } catch (requestError) {
      setListError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible eliminar la lectura.',
      )
    } finally {
      setIsAddingReading(false)
      setReadingToDelete(null)
    }
  }

  const isMutatingList =
    isUpdatingLibrary || isUpdatingWishlist || isAddingReading || listLoading

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando detalle del tomo...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card volume-detail-card">
        {error ? <p className="form-message error">{error}</p> : null}
        {listError ? <p className="form-message error">{listError}</p> : null}
        {listNotice ? <p className="form-message success">{listNotice}</p> : null}

        {!volume || !comic ? null : (
          <div className="volume-detail-grid">
            <section>
              <p className="eyebrow">Comiku / Detalle tomo</p>
              <h1>
                {volume.numeroTomo !== null
                  ? `Tomo ${volume.numeroTomo}`
                  : 'Tomo único'}
              </h1>
              <p className="lead">Comic: {comic.nombre}</p>

              <div className="volume-detail-meta">
                <p>
                  <strong>ISBN:</strong> {volume.isbn || 'No definido'}
                </p>
                <p>
                  <strong>Publicación:</strong>{' '}
                  {formatPublicationDate(volume.fechaPublicacion)}
                </p>
                <p>
                  <strong>Tipo:</strong> {volume.tomoUnico ? 'Tomo único' : 'Numerado'}
                </p>
                <p>
                  <strong>Leído:</strong> {libraryData.leido ? 'Sí' : 'No'}
                </p>
              </div>

              <div className="volume-list-actions">
                <button
                  className={`volume-list-button ${membership.inLibrary ? 'active-library' : ''}`}
                  type="button"
                  onClick={handleToggleLibrary}
                  disabled={isMutatingList}
                >
                  {membership.inLibrary ? 'En biblioteca ✓' : '+ Agregar a biblioteca'}
                </button>

                <button
                  className={`volume-list-button ${membership.inWishlist ? 'active-wishlist' : ''}`}
                  type="button"
                  onClick={handleToggleWishlist}
                  disabled={isMutatingList}
                >
                  {membership.inWishlist ? 'En deseados ✓' : '+ Agregar a deseados'}
                </button>
              </div>

              {membership.inLibrary ? (
                <section className="volume-reading-panel">
                  <h2>Agregar lectura</h2>
                  <form className="volume-reading-form" onSubmit={handleAddReading}>
                    <label htmlFor="reading-date">Fecha de lectura</label>
                    <div className="volume-reading-form-row">
                      <input
                        id="reading-date"
                        type="date"
                        value={readingDate}
                        onChange={(event) => setReadingDate(event.target.value)}
                        disabled={isMutatingList}
                      />
                      <button
                        className="volume-reading-button"
                        type="submit"
                        disabled={isMutatingList || !readingDate}
                      >
                        Guardar lectura
                      </button>
                    </div>
                  </form>

                  <div className="volume-reading-history">
                    <h3>Lecturas guardadas</h3>
                    {sortedReadings.length === 0 ? (
                      <p className="helper-text">
                        Todavía no registraste lecturas para este tomo.
                      </p>
                    ) : (
                      <ul className="volume-reading-list">
                        {sortedReadings.map((item) => (
                          <li key={item.id} className="volume-reading-item">
                            <span>{formatReadingDate(item.date)}</span>
                            <button
                              type="button"
                              className="volume-reading-delete-button"
                              onClick={() => handleDeleteReading(item)}
                              disabled={isMutatingList}
                              aria-label={`Eliminar lectura del ${formatReadingDate(item.date)}`}
                            >
                              Eliminar lectura
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ) : (
                <p className="helper-text volume-reading-helper">
                  Agrega este tomo a tu biblioteca para registrar lecturas.
                </p>
              )}
            </section>

            <section className="volume-detail-cover-area">
              {volume.portada?.dataUrl ? (
                <img
                  className="volume-detail-cover"
                  src={volume.portada.dataUrl}
                  alt={`Portada del ${volume.numeroTomo !== null ? `tomo ${volume.numeroTomo}` : 'tomo único'}`}
                />
              ) : (
                <div className="volume-detail-cover-placeholder">Sin portada</div>
              )}
            </section>
          </div>
        )}

        {readingToDelete ? (
          <div className="reading-modal-backdrop" role="presentation">
            <div
              className="reading-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reading-modal-title"
            >
              <p className="eyebrow">Confirmar eliminación</p>
              <h2 id="reading-modal-title">Eliminar lectura</h2>
              <p className="reading-modal-text">
                Vas a borrar la lectura del {formatReadingDate(readingToDelete.date)}.
                Esta acción no se puede deshacer.
              </p>

              <div className="reading-modal-actions">
                <button
                  type="button"
                  className="reading-modal-button secondary"
                  onClick={() => setReadingToDelete(null)}
                  disabled={isMutatingList}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="reading-modal-button destructive"
                  onClick={confirmDeleteReading}
                  disabled={isMutatingList}
                >
                  Eliminar lectura
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default VolumeDetailPage