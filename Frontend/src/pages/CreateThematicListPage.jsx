import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getAllComics,
  getComicVolumes,
} from '../firebase/comics'
import {
  addVolumeToList,
  createThematicList,
  getListVolumes,
  getThematicListById,
  removeVolumeFromList,
  updateListPhotos,
  updateThematicList,
} from '../firebase/thematicLists'
import { createThumbnailFromDataUrl } from '../constants/imageUpload'
import VolumeCoverCard from '../Components/VolumeCoverCard'
import '../styles/ComicForm.css'
import '../styles/Navbar.css'
import '../styles/ThematicListsShared.css'
import '../styles/CreateThematicListPage.css'

function normalizeText(value) {
  return (value || '').toLowerCase().trim()
}

function getSearchScore(name, query) {
  if (name === query) {
    return 0
  }

  if (name.startsWith(query)) {
    return 1
  }

  const matchIndex = name.indexOf(query)

  if (matchIndex >= 0) {
    return 2 + matchIndex
  }

  return Number.POSITIVE_INFINITY
}

function formatVolumeTitle(volume) {
  if (volume.tomoUnico) {
    return 'Tomo único'
  }

  if (volume.numeroTomo !== null && volume.numeroTomo !== undefined) {
    return `Tomo ${volume.numeroTomo}`
  }

  return 'Tomo sin número'
}

function formatSearchResultTitle(comicName, volume) {
  return `${comicName} - ${formatVolumeTitle(volume)}`
}

function parseComicSearchQuery(query) {
  const normalizedQuery = normalizeText(query)

  if (!normalizedQuery) {
    return {
      comicQuery: '',
      volumeNumber: null,
    }
  }

  const volumeMatch = normalizedQuery.match(/^(.*?)(?:\s+(?:tomo|volumen|vol)?\s*(\d+))$/)

  if (!volumeMatch) {
    return {
      comicQuery: normalizedQuery,
      volumeNumber: null,
    }
  }

  return {
    comicQuery: volumeMatch[1].trim(),
    volumeNumber: Number.parseInt(volumeMatch[2], 10),
  }
}

async function buildListCoverPhotos(volumes) {
  const coverSources = volumes
    .slice(0, 3)
    .map((volume) => volume.volumenData?.portada?.dataUrl)
    .filter(Boolean)

  const compressedPhotos = await Promise.all(
    coverSources.map((dataUrl) =>
      createThumbnailFromDataUrl(dataUrl, {
        maxWidth: 220,
        maxHeight: 330,
        quality: 0.7,
      }),
    ),
  )

  return compressedPhotos.filter(Boolean)
}

function CreateThematicListPage({
  authUser,
  listId,
  onBack,
  onFinishCreation,
}) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(listId ? true : false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const searchRef = useRef(null)

  // Paso 1: Datos de la lista
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [esGuiaDeLectura, setEsGuiaDeLectura] = useState(false)

  // Paso 2: Tomos
  const [allComics, setAllComics] = useState([])
  const [allComicVolumes, setAllComicVolumes] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedVolumes, setSelectedVolumes] = useState([])
  const [loadingComics, setLoadingComics] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!searchRef.current?.contains(event.target)) {
        setIsSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Cargar lista existente si estamos editando
  useEffect(() => {
    let cancelled = false

    async function loadExistingList() {
      if (!listId || !authUser?.uid) {
        setLoading(false)
        return
      }

      try {
        const list = await getThematicListById({ listId })

        if (cancelled) return

        if (!list || list.userId !== authUser.uid) {
          setError('No tienes permiso para editar esta lista.')
          return
        }

        setNombre(list.nombre)
        setDescripcion(list.descripcion)
        setEsGuiaDeLectura(list.esGuiaDeLectura)

        const volumes = await getListVolumes({ listId })

        if (!cancelled) {
          const volumesWithData = await Promise.all(
            volumes.map(async (v) => {
              try {
                const { getComicVolumeById } = await import('../firebase/comics')
                const volumeData = await getComicVolumeById({
                  comicId: v.comicId,
                  volumeId: v.volumeId,
                })
                return {
                  id: v.id,
                  comicId: v.comicId,
                  volumeId: v.volumeId,
                  volumenData: volumeData,
                }
              } catch {
                return {
                  id: v.id,
                  comicId: v.comicId,
                  volumeId: v.volumeId,
                  volumenData: null,
                }
              }
            }),
          )

          setSelectedVolumes(volumesWithData)
          setStep(1)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar la lista.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadExistingList()

    return () => {
      cancelled = true
    }
  }, [listId, authUser?.uid])

  // Cargar todos los comics cuando llegamos al paso 2
  useEffect(() => {
    if (step !== 2) return

    let cancelled = false

    async function loadComics() {
      try {
        setLoadingComics(true)
        const comics = await getAllComics()

        if (!cancelled) {
          setAllComics(comics)
        }

        const comicsWithVolumes = await Promise.all(
          comics.map(async (comic) => {
            try {
              const volumes = await getComicVolumes(comic.id)

              return volumes.map((volume) => ({
                comicId: comic.id,
                comicNombre: comic.nombre,
                comicEditorial: comic.editorial,
                comicAutores: comic.autores,
                volume,
              }))
            } catch {
              return []
            }
          }),
        )

        if (!cancelled) {
          setAllComicVolumes(comicsWithVolumes.flat())
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar los comics.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingComics(false)
        }
      }
    }

    loadComics()

    return () => {
      cancelled = true
    }
  }, [step])

  useEffect(() => {
    if (step !== 2) {
      setAllComicVolumes([])
    }
  }, [step])

  const filteredComics = useMemo(() => {
    const { comicQuery } = parseComicSearchQuery(searchQuery)

    if (!comicQuery) {
      return []
    }

    return allComics
      .map((comic) => ({
        comic,
        score: getSearchScore(normalizeText(comic.nombre), comicQuery),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => {
        if (a.score !== b.score) {
          return a.score - b.score
        }

        return a.comic.nombre.localeCompare(b.comic.nombre, 'es')
      })
      .map((entry) => entry.comic)
      .slice(0, 8)
  }, [allComics, searchQuery])

  const parsedSearch = useMemo(() => parseComicSearchQuery(searchQuery), [searchQuery])

  const filteredVolumes = useMemo(() => {
    if (!allComicVolumes.length) {
      return []
    }

    const query = parsedSearch.comicQuery

    if (!query) {
      return []
    }

    return allComicVolumes
      .map((entry) => {
        const score = getSearchScore(normalizeText(entry.comicNombre), query)

        if (!Number.isFinite(score)) {
          return null
        }

        if (parsedSearch.volumeNumber !== null) {
          if (
            entry.volume.numeroTomo === null ||
            entry.volume.numeroTomo === undefined ||
            Number(entry.volume.numeroTomo) !== parsedSearch.volumeNumber
          ) {
            return null
          }
        }

        return {
          ...entry,
          score,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return a.score - b.score
        }

        const aVolume = Number(a.volume.numeroTomo ?? Number.POSITIVE_INFINITY)
        const bVolume = Number(b.volume.numeroTomo ?? Number.POSITIVE_INFINITY)

        if (aVolume !== bVolume) {
          return aVolume - bVolume
        }

        return a.comicNombre.localeCompare(b.comicNombre, 'es')
      })
      .slice(0, 8)
  }, [allComicVolumes, parsedSearch.comicQuery, parsedSearch.volumeNumber])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setIsSearchOpen(false)
    }
  }, [searchQuery])

  const handleNext = async () => {
    setError('')

    if (!nombre.trim()) {
      setError('Nombre de lista es obligatorio.')
      return
    }

    setStep(2)
  }

  const handleSearchChange = (value) => {
    setSearchQuery(value)
    setError('')
    setNotice('')
    setIsSearchOpen(true)
  }

  const handleSelectComic = (comic) => {
    setSearchQuery(comic.nombre)
    setIsSearchOpen(false)
    setError('')
    setNotice('')
  }

  const handleSelectVolume = (result) => {
    const volume = result.volume

    const alreadyAdded = selectedVolumes.some(
      (selectedVolume) =>
        selectedVolume.comicId === result.comicId &&
        selectedVolume.volumeId === volume.id,
    )

    if (alreadyAdded) {
      setError('Este tomo ya fue agregado a la lista.')
      return
    }

    const newVolume = {
      id: `temp-${Date.now()}`,
      comicId: result.comicId,
      volumeId: volume.id,
      volumenData: volume,
    }

    setSelectedVolumes([...selectedVolumes, newVolume])
    setSearchQuery('')
    setIsSearchOpen(false)
    setError('')
    setNotice('')
  }

  const handleRemoveVolume = (volumeIndex) => {
    const newVolumes = selectedVolumes.filter((_, idx) => idx !== volumeIndex)
    setSelectedVolumes(newVolumes)
  }

  const handleFinish = async () => {
    setError('')
    setNotice('')

    if (selectedVolumes.length === 0) {
      setError('Debes agregar al menos un tomo a la lista.')
      return
    }

    try {
      setSaving(true)

      if (listId) {
        // Actualizar lista existente
        await updateThematicList({
          listId,
          nombre,
          descripcion,
          esGuiaDeLectura,
        })

        const currentVolumes = await getListVolumes({ listId })

        // Eliminar tomos removidos y agregar nuevos (evitar duplicados)
        const currentVolumeIds = new Set(currentVolumes.map((v) => v.volumeId))
        const selectedVolumeIds = new Set(selectedVolumes.map((v) => v.volumeId))

        // Borrar los que estaban en BD pero el usuario removió
        for (const currentVolume of currentVolumes) {
          if (!selectedVolumeIds.has(currentVolume.volumeId)) {
            await removeVolumeFromList({ listId, volumeId: currentVolume.volumeId })
          }
        }

        // Agregar los nuevos tomos que el usuario añadió
        for (let i = 0; i < selectedVolumes.length; i++) {
          const volume = selectedVolumes[i]

          if (!currentVolumeIds.has(volume.volumeId)) {
            await addVolumeToList({
              listId,
              comicId: volume.comicId,
              volumeId: volume.volumeId,
              orden: i,
            })
          }
        }

        // Actualizar fotos de portadas con los primeros 3 tomos
        const photos = await buildListCoverPhotos(selectedVolumes)

        await updateListPhotos({
          listId,
          fotosDePortadas: photos,
        })

        onFinishCreation(listId)
        return
      } else {
        // Crear nueva lista
        if (!authUser?.uid) {
          setError('No hay sesión activa.')
          return
        }

        const newListId = await createThematicList({
          userId: authUser.uid,
          nombre,
          descripcion,
          esGuiaDeLectura,
        })

        // Agregar tomos a la nueva lista
        for (let i = 0; i < selectedVolumes.length; i++) {
          const volume = selectedVolumes[i]

          await addVolumeToList({
            listId: newListId,
            comicId: volume.comicId,
            volumeId: volume.volumeId,
            orden: i,
          })
        }

        // Actualizar fotos de portadas con los primeros 3 tomos
        const photos = await buildListCoverPhotos(selectedVolumes)

        await updateListPhotos({
          listId: newListId,
          fotosDePortadas: photos,
        })

        onFinishCreation(newListId)
        return
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Error al guardar la lista.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Comiku / {listId ? 'Editar' : 'Crear'} lista temática</p>
            <h1>{listId ? 'Editar lista temática' : 'Crear nueva lista temática'}</h1>
            <p className="lead">
              {step === 1
                ? 'Completa los datos básicos de tu lista temática.'
                : 'Agrega los tomos que deseas incluir en tu lista.'}
            </p>
          </div>

          <div className="hero-actions">
            <button className="back-button" onClick={onBack} type="button">
              Volver
            </button>
          </div>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}
        {notice ? <p className="form-message success">{notice}</p> : null}

        {step === 1 ? (
          <form className="comic-form" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="list-name">Nombre de la lista</label>
            <input
              id="list-name"
              maxLength={120}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ejemplo: Manga que cambió mi vida"
              type="text"
              value={nombre}
            />

            <label htmlFor="list-description">Descripción</label>
            <textarea
              id="list-description"
              maxLength={500}
              onChange={(event) => setDescripcion(event.target.value)}
              placeholder="Describe el propósito de esta lista..."
              rows={4}
              value={descripcion}
            />

            <label htmlFor="list-type">¿Es una guía de lectura?</label>
            <select
              id="list-type"
              onChange={(event) => setEsGuiaDeLectura(event.target.value === 'si')}
              value={esGuiaDeLectura ? 'si' : 'no'}
            >
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>

            <button
              className="primary-button"
              onClick={handleNext}
              type="button"
            >
              Siguiente
            </button>
          </form>
        ) : (
          <div>
            <div className="search-form">
              <div className="search-input-wrapper" ref={searchRef}>
                <label htmlFor="comic-search-input">Buscar comic por nombre</label>
                <input
                  id="comic-search-input"
                  type="text"
                  placeholder="Ejemplo: One Piece"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  onFocus={() => setIsSearchOpen(true)}
                  className="search-input"
                />

                {isSearchOpen && filteredComics.length > 0 ? (
                  <ul className="search-suggestion-list" role="listbox">
                    {filteredComics.map((comic) => (
                      <li key={comic.id}>
                        <button
                          type="button"
                          className="search-suggestion-button"
                          onClick={() => handleSelectComic(comic)}
                        >
                          <strong>{comic.nombre}</strong>
                          <span>{comic.editorial || 'Sin editorial'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {isSearchOpen && normalizeText(searchQuery) && filteredComics.length === 0 ? (
                  <p className="search-empty-state">No se encontraron comics con ese nombre.</p>
                ) : null}
              </div>
            </div>

            {normalizeText(searchQuery) ? (
              <p className="helper-text">Busca un comic para ver sus tomos y agregarlos.</p>
            ) : null}

            {loadingComics ? (
              <p className="helper-text">Cargando comics...</p>
            ) : normalizeText(searchQuery) ? (
              filteredVolumes.length === 0 ? (
                <p className="helper-text">No se encontró ese tomo para este comic.</p>
              ) : (
                <div className="search-results-wrapper">
                  <ul className="search-suggestion-list thematic-volume-suggestions" role="listbox">
                    {filteredVolumes.map((result) => (
                      <li key={result.volume.id}>
                        <button
                          type="button"
                          className="search-suggestion-button"
                          onClick={() => handleSelectVolume(result)}
                        >
                          <strong>{formatSearchResultTitle(result.comicNombre, result.volume)}</strong>
                          <span>
                            {result.comicEditorial || 'Sin editorial'}
                            {' · '}
                            {result.comicAutores?.join(', ') || 'Sin autor'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}

            <div className="section-divider">
              <h2>Tomos agregados ({selectedVolumes.length})</h2>
            </div>

            {selectedVolumes.length === 0 ? (
              <p className="helper-text">Aún no has agregado tomos. Busca y agrega algunos.</p>
            ) : (
              <div className="selected-volumes-grid">
                {selectedVolumes.map((volume, idx) => (
                  <div key={idx} className="selected-volume-card">
                    <VolumeCoverCard
                      volume={volume.volumenData || {}}
                      onOpen={() => {}}
                      comicName=""
                    />
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveVolume(idx)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setStep(1)}
                type="button"
              >
                Atrás
              </button>
              <button
                className="primary-button"
                onClick={handleFinish}
                disabled={saving || selectedVolumes.length === 0}
                type="button"
              >
                {saving ? 'Guardando...' : 'Guardar lista'}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default CreateThematicListPage
