import { useEffect, useRef, useState } from 'react'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import { getComicById, getComicVolumes } from '../firebase/comics'
import { getUserLibraryItems } from '../firebase/volumeLists'
import '../styles/ComicDetailPage.css'

function ComicDetailPage({ authUser, comicId, onOpenVolume }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comic, setComic] = useState(null)
  const [volumes, setVolumes] = useState([])
  const [userLibraryVolumes, setUserLibraryVolumes] = useState([])
  const volumeGridRef = useRef(null)
  const volumeGridLeftRef = useRef(null)
  const volumeGridRightRef = useRef(null)

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
          setUserLibraryVolumes([])
          return
        }

        setComic(comicData)
        setVolumes(volumeData)

        if (authUser?.uid) {
          try {
            const libraryItems = await getUserLibraryItems({ uid: authUser.uid })
            const comicInLibrary = libraryItems.find((item) => item.comicId === comicId)
            setUserLibraryVolumes(comicInLibrary?.volumes ?? [])
          } catch {
            setUserLibraryVolumes([])
          }
        } else {
          setUserLibraryVolumes([])
        }
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
  }, [comicId, authUser?.uid])

  const scrollVolumes = (direction, ref) => {
    if (!ref?.current) return

    const scrollAmount = 220
    ref.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const hasComicInLibrary = userLibraryVolumes.length > 0

  const libraryVolumeIds = new Set(userLibraryVolumes.map((v) => v.id))
  const missingVolumes = volumes.filter((volume) => !libraryVolumeIds.has(volume.id))
  const ownedVolumes = volumes.filter((volume) => libraryVolumeIds.has(volume.id))

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
              {volumes.length === 0 ? (
                <>
                  <h2>Tomos y portadas</h2>
                  <p className="helper-text">Este comic todavía no tiene tomos cargados.</p>
                </>
              ) : hasComicInLibrary ? (
                <>
                  {missingVolumes.length > 0 && (
                    <div>
                      <h2>Me faltan</h2>
                      <div className="volume-carousel">
                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-left"
                          onClick={() => scrollVolumes('left', volumeGridLeftRef)}
                          aria-label="Desplazar tomos hacia la izquierda"
                        >
                          ←
                        </button>

                        <div className="volume-cover-grid" ref={volumeGridLeftRef}>
                          {missingVolumes.map((volume) => (
                            <VolumeCoverCard
                              key={volume.id}
                              volume={volume}
                              onOpen={onOpenVolume}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-right"
                          onClick={() => scrollVolumes('right', volumeGridLeftRef)}
                          aria-label="Desplazar tomos hacia la derecha"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}

                  {ownedVolumes.length > 0 && (
                    <div>
                      <h2>Tengo</h2>
                      <div className="volume-carousel">
                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-left"
                          onClick={() => scrollVolumes('left', volumeGridRightRef)}
                          aria-label="Desplazar tomos hacia la izquierda"
                        >
                          ←
                        </button>

                        <div className="volume-cover-grid" ref={volumeGridRightRef}>
                          {ownedVolumes.map((volume) => (
                            <VolumeCoverCard
                              key={volume.id}
                              volume={volume}
                              onOpen={onOpenVolume}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          className="volume-scroll-button volume-scroll-right"
                          onClick={() => scrollVolumes('right', volumeGridRightRef)}
                          aria-label="Desplazar tomos hacia la derecha"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2>Tomos y portadas</h2>
                  <div className="volume-carousel">
                    <button
                      type="button"
                      className="volume-scroll-button volume-scroll-left"
                      onClick={() => scrollVolumes('left', volumeGridRef)}
                      aria-label="Desplazar tomos hacia la izquierda"
                    >
                      ←
                    </button>

                    <div className="volume-cover-grid" ref={volumeGridRef}>
                      {volumes.map((volume) => (
                        <VolumeCoverCard
                          key={volume.id}
                          volume={volume}
                          onOpen={onOpenVolume}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      className="volume-scroll-button volume-scroll-right"
                      onClick={() => scrollVolumes('right', volumeGridRef)}
                      aria-label="Desplazar tomos hacia la derecha"
                    >
                      →
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

export default ComicDetailPage