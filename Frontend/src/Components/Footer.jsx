import '../styles/Footer.css'

const appIconUrl = `${import.meta.env.BASE_URL}icon.png`

function Footer({ onOpenContacto }) {
  return (
    <footer className="app-footer">
      <div className="app-footer-content">
        <div className="app-footer-brand">
          <img className="app-footer-logo" src={appIconUrl} alt="Comiku" />
          <h1 className="app-footer-title">Comiku</h1>
        </div>

        <p className="app-footer-legal">
          Comiku es una plataforma destinada a la catalogación y gestión de colecciones de cómics y mangas. Las imágenes, nombres, marcas y obras mostradas pertenecen a sus respectivos propietarios. Comiku no reclama la titularidad de dichos contenidos y los utiliza únicamente con fines informativos y de referencia.
        </p>

        <div className="app-footer-contact">
          <p className="app-footer-contact-text">
            Si quieres comunicarte con administración, puedes enviar un mensaje desde el formulario de contacto.
          </p>

          {typeof onOpenContacto === 'function' ? (
            <button
              type="button"
              className="primary-button"
              onClick={onOpenContacto}
            >
              Contacto
            </button>
          ) : null}
        </div>

        <p className="app-footer-copyright">© 2026 Comiku</p>
      </div>
    </footer>
  )
}

export default Footer