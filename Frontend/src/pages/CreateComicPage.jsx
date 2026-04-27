import { useMemo, useState } from 'react'
import { COMIC_GENRES } from '../constants/comicGenres'
import '../styles/ComicForm.css'

const FORBIDDEN_INPUT_CHARACTERS = /[@#$^&*{}[\]<>]/

const COUNTRIES = [
  'Argentina',
  'Brasil',
  'México',
  'Chile',
  'Reino Unido',
  'Canadá',
  'Alemania',
  'Corea del Sur',
  'China',
  'Italia',
  'España',
  'Japón',
  'Estados Unidos',
  'Francia',
  'Bélgica',
  'Peru',
  'Rusia',
]

const STATUS_OPTIONS = ['En curso', 'Finalizado']

function hasForbiddenCharacters(value) {
  return FORBIDDEN_INPUT_CHARACTERS.test(value)
}

function CreateComicPage({ onBack, onComicCreated }) {
  const [nombre, setNombre] = useState('')
  const [autores, setAutores] = useState([''])
  const [editorial, setEditorial] = useState('')
  const [paisEditorial, setPaisEditorial] = useState('')
  const [estado, setEstado] = useState(STATUS_OPTIONS[0])
  const [generos, setGeneros] = useState([''])
  const [descripcion, setDescripcion] = useState('')
  const [formato, setFormato] = useState('')
  const [formError, setFormError] = useState('')

  const sortedCountries = useMemo(
    () => [...COUNTRIES].sort((a, b) => a.localeCompare(b, 'es')),
    [],
  )

  const sortedGenres = useMemo(
    () => [...COMIC_GENRES].sort((a, b) => a.localeCompare(b, 'es')),
    [],
  )

  const updateAuthor = (index, value) => {
    setAutores((current) =>
      current.map((author, currentIndex) =>
        currentIndex === index ? value : author,
      ),
    )
  }

  const updateGenre = (index, value) => {
    setGeneros((current) =>
      current.map((genre, currentIndex) =>
        currentIndex === index ? value : genre,
      ),
    )
  }

  const removeAuthor = (index) => {
    setAutores((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const removeGenre = (index) => {
    setGeneros((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const validateForm = () => {
    const requiredTextFields = [
      { label: 'Nombre', value: nombre },
      { label: 'Editorial', value: editorial },
      { label: 'Descripción', value: descripcion },
      { label: 'Formato', value: formato },
    ]

    for (const field of requiredTextFields) {
      if (!field.value.trim()) {
        return `${field.label} es obligatorio.`
      }

      if (hasForbiddenCharacters(field.value)) {
        return `${field.label} contiene caracteres no permitidos.`
      }
    }

    if (!paisEditorial) {
      return 'Selecciona el país de la editorial.'
    }

    const cleanAuthors = autores
      .map((author) => author.trim())
      .filter(Boolean)

    if (cleanAuthors.length < 1) {
      return 'Ingresa al menos un autor.'
    }

    for (const author of cleanAuthors) {
      if (hasForbiddenCharacters(author)) {
        return 'Un autor contiene caracteres no permitidos.'
      }
    }

    const cleanGenres = generos
      .map((genre) => genre.trim())
      .filter(Boolean)

    if (cleanGenres.length < 1) {
      return 'Selecciona al menos un género.'
    }

    return ''
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setFormError('')

    const validationMessage = validateForm()

    if (validationMessage) {
      setFormError(validationMessage)
      return
    }

    try {
      const comicDraft = {
        nombre: nombre.trim(),
        autores: autores.map((author) => author.trim()).filter(Boolean),
        editorial: editorial.trim(),
        paisEditorial,
        estado,
        generos: generos.map((genre) => genre.trim()).filter(Boolean),
        descripcion: descripcion.trim(),
        formato: formato.trim(),
      }

      onComicCreated(comicDraft)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No fue posible guardar los datos del comic.'
      setFormError(message)
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Comiku / Nuevo comic</p>
            <h1>Crear comic</h1>
            <p className="lead">
              Completa los datos principales para guardar el comic en tu colección.
            </p>
          </div>

          <div className="hero-actions">
            <button className="back-button" onClick={onBack} type="button">
              Volver al inicio
            </button>
          </div>
        </div>

        {formError ? <p className="form-message error">{formError}</p> : null}

        <form className="comic-form" onSubmit={handleSubmit}>
          <label htmlFor="comic-name">Nombre</label>
          <input
            id="comic-name"
            maxLength={120}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ejemplo: One Piece"
            required
            type="text"
            value={nombre}
          />

          <fieldset className="dynamic-group">
            <legend>Autor o autores</legend>
            {autores.map((author, index) => (
              <div className="dynamic-row" key={`autor-${index + 1}`}>
                <input
                  maxLength={100}
                  onChange={(event) => updateAuthor(index, event.target.value)}
                  placeholder={`Autor ${index + 1}`}
                  required={index === 0}
                  type="text"
                  value={author}
                />
                <button
                  className="small-button"
                  disabled={autores.length === 1}
                  onClick={() => removeAuthor(index)}
                  type="button"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              className="small-button secondary"
              onClick={() => setAutores((current) => [...current, ''])}
              type="button"
            >
              Agregar autor
            </button>
          </fieldset>

          <label htmlFor="comic-editorial">Editorial</label>
          <input
            id="comic-editorial"
            maxLength={120}
            onChange={(event) => setEditorial(event.target.value)}
            required
            type="text"
            value={editorial}
          />

          <label htmlFor="comic-country">País de editorial</label>
          <select
            id="comic-country"
            onChange={(event) => setPaisEditorial(event.target.value)}
            required
            value={paisEditorial}
          >
            <option value="">Selecciona un país</option>
            {sortedCountries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>

          <label htmlFor="comic-status">Estado</label>
          <select
            id="comic-status"
            onChange={(event) => setEstado(event.target.value)}
            value={estado}
          >
            {STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption}
              </option>
            ))}
          </select>

          <fieldset className="dynamic-group">
            <legend>Género o géneros</legend>
            {generos.map((genre, index) => (
              <div className="dynamic-row" key={`genero-${index + 1}`}>
                <select
                  onChange={(event) => updateGenre(index, event.target.value)}
                  required={index === 0}
                  value={genre}
                >
                  <option value="">Selecciona un género</option>
                  {sortedGenres.map((genreOption) => (
                    <option key={genreOption} value={genreOption}>
                      {genreOption}
                    </option>
                  ))}
                </select>
                <button
                  className="small-button"
                  disabled={generos.length === 1}
                  onClick={() => removeGenre(index)}
                  type="button"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              className="small-button secondary"
              onClick={() => setGeneros((current) => [...current, ''])}
              type="button"
            >
              Agregar género
            </button>
          </fieldset>

          <label htmlFor="comic-description">Descripción</label>
          <textarea
            id="comic-description"
            maxLength={1000}
            onChange={(event) => setDescripcion(event.target.value)}
            required
            rows={4}
            value={descripcion}
          />

          <label htmlFor="comic-format">Formato</label>
          <input
            id="comic-format"
            maxLength={80}
            onChange={(event) => setFormato(event.target.value)}
            placeholder="Ejemplo: Tankobon"
            required
            type="text"
            value={formato}
          />

          <button className="primary-button" type="submit">
            Siguiente
          </button>
        </form>
      </section>
    </main>
  )
}

export default CreateComicPage
