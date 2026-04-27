import { useEffect, useState } from 'react'
import { getComicById, getComicVolumeById } from '../firebase/comics'
import {
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
  const [membership, setMembership] = useState({
    inLibrary: false,
    inWishlist: false,
  })

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
          setListLoading(false)
        }
        return
      }

      try {
        setListLoading(true)
        setListError('')
        const nextMembership = await getVolumeMembership({
          uid: authUser.uid,
          comicId,
          volumeId,
        })

        if (!cancelled) {
          setMembership(nextMembership)
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

  const isMutatingList = isUpdatingLibrary || isUpdatingWishlist || listLoading

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
                  <strong>Tipo:</strong>{' '}
                  {volume.tomoUnico ? 'Tomo único' : 'Numerado'}
                </p>
              </div>

              <div className="volume-list-actions">
                <button
                  className={`volume-list-button ${membership.inLibrary ? 'active-library' : ''}`}
                  type="button"
                  onClick={handleToggleLibrary}
                  disabled={isMutatingList}
                >
                  {membership.inLibrary
                    ? 'En biblioteca ✓'
                    : '+ Agregar a biblioteca'}
                </button>

                <button
                  className={`volume-list-button ${membership.inWishlist ? 'active-wishlist' : ''}`}
                  type="button"
                  onClick={handleToggleWishlist}
                  disabled={isMutatingList}
                >
                  {membership.inWishlist
                    ? 'En deseados ✓'
                    : '+ Agregar a deseados'}
                </button>
              </div>
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
      </section>
    </main>
  )
}

export default VolumeDetailPage