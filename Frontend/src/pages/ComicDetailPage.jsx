import { useEffect, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import { getComicById, getComicVolumes } from '../firebase/comics'
import '../styles/ComicDetailPage.css'

function ComicDetailPage({ comicId, onOpenVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comic, setComic] = useState(null)
  const [volumes, setVolumes] = useState([])

  useEffect(() => {
    let cancelled = false

    async function loadComicDetail() {
      if (!comicId) {
        setError('No se encontró el comic solicitado.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const [comicData, volumeData] = await Promise.all([
          getComicById(comicId),
          getComicVolumes(comicId),
        ])

        if (cancelled) {
          return
        }

        if (!comicData) {
          setError('El comic solicitado no existe o fue eliminado.')
          setComic(null)
          setVolumes([])
          return
        }

        setComic(comicData)
        setVolumes(volumeData)
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el detalle del comic.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadComicDetail()

    return () => {
      cancelled = true
    }
  }, [comicId])

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando detalle del comic...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card comic-detail-card">
        {error ? <p className="form-message error">{error}</p> : null}

        {!comic ? null : (
          <>
            <header className="comic-detail-header">
              <p className="eyebrow">Comiku / Detalle comic</p>
              <h1>{comic.nombre}</h1>
              <p className="lead">{comic.descripcion || 'Sin descripción.'}</p>
            </header>

            <section className="comic-detail-metadata">
              <p>
                <strong>Autores:</strong>{' '}
                {comic.autores.length > 0 ? comic.autores.join(', ') : 'No definidos'}
              </p>
              <p>
                <strong>Editorial:</strong> {comic.editorial || 'No definida'}
              </p>
              <p>
                <strong>País:</strong> {comic.paisEditorial || 'No definido'}
              </p>
              <p>
                <strong>Estado:</strong> {comic.estado || 'No definido'}
              </p>
              <p>
                <strong>Géneros:</strong>{' '}
                {comic.generos.length > 0 ? comic.generos.join(', ') : 'No definidos'}
              </p>
              <p>
                <strong>Formato:</strong> {comic.formato || 'No definido'}
              </p>
            </section>

            <section className="comic-detail-volumes">
              <h2>Tomos y portadas</h2>
              {volumes.length === 0 ? (
                <p className="helper-text">Este comic todavía no tiene tomos cargados.</p>
              ) : (
                <div className="volume-cover-grid">
                  {volumes.map((volume) => (
                    <VolumeCoverCard
                      key={volume.id}
                      volume={volume}
                      onOpen={onOpenVolume}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

export default ComicDetailPage