import { useEffect, useState } from 'react'
import { checkFirestoreConnection } from './firebase/firestore'
import {
  firebaseSetupMessage,
  isFirebaseConfigured,
} from './firebase/firebase'
import './styles/App.css'

function App() {
  const [connection, setConnection] = useState({
    status: isFirebaseConfigured ? 'checking' : 'missing',
    message: isFirebaseConfigured
      ? 'Verificando acceso a Firestore...'
      : firebaseSetupMessage,
    documents: null,
    collection: null,
  })

  const runCheck = async () => {
    if (!isFirebaseConfigured) {
      return
    }

    setConnection({
      status: 'checking',
      message: 'Verificando acceso a Firestore...',
      documents: null,
      collection: null,
    })

    try {
      const result = await checkFirestoreConnection()

      setConnection({
        status: 'connected',
        message: 'Comiku se conecto con Firestore.',
        documents: result.documents,
        collection: result.collection,
      })
    } catch (error) {
      setConnection({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible conectar con Firestore.',
        documents: null,
        collection: null,
      })
    }
  }

  useEffect(() => {
    runCheck()
  }, [])

  const statusLabel = {
    connected: 'Conectado',
    checking: 'Verificando',
    missing: 'Falta configurar',
    error: 'Error',
  }[connection.status]

  const statusDescription = {
    connected: 'La conexión con Firestore está activa.',
    checking: 'Estamos validando la configuración del proyecto.',
    missing: 'Crea un archivo .env con las variables de Firebase.',
    error: 'Revisa las credenciales y las reglas de seguridad.',
  }[connection.status]

  const requirements = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ]

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Comiku / Firestore</p>
            <h1>Conexión lista para tus datos</h1>
            <p className="lead">
              Este frontend verifica la configuración de Firebase y confirma si
              Firestore responde correctamente.
            </p>
          </div>

          <div className={`status-badge status-${connection.status}`}>
            <span className="status-dot" aria-hidden="true"></span>
            {statusLabel}
          </div>
        </div>

        <div className="status-panel">
          <div>
            <p className="status-title">Estado actual</p>
            <p className="status-message">{connection.message || statusDescription}</p>
          </div>

          <div className="status-metrics">
            <div>
              <span className="metric-value">
                {connection.documents ?? '--'}
              </span>
              <span className="metric-label">Documentos leídos</span>
            </div>
            <div>
              <span className="metric-value">
                {connection.collection ?? 'N/A'}
              </span>
              <span className="metric-label">Colección consultada</span>
            </div>
          </div>
        </div>

        <div className="content-grid">
          <section className="info-card">
            <h2>Variables necesarias</h2>
            <p>
              Copia el archivo .env de ejemplo y completa estas claves con los
              datos de tu proyecto de Firebase.
            </p>

            <ul className="env-list">
              {requirements.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </section>

          <section className="info-card">
            <h2>Qué hace esta base</h2>
            <ul className="feature-list">
              <li>Inicializa Firebase solo cuando la configuración existe.</li>
              <li>Prueba Firestore sin escribir datos de prueba.</li>
              <li>Deja el proyecto listo para Auth, Storage o reglas propias.</li>
            </ul>

            <button className="retry-button" onClick={runCheck} type="button">
              Probar conexión otra vez
            </button>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
