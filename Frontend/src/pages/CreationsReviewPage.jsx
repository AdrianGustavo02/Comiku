import { useEffect, useState } from 'react'
import { listPendingCreations, deletePendingCreation } from '../firebase/pendingCreations'
import { getComicById } from '../firebase/comics'
import { getUserProfile } from '../firebase/user'
import ConfirmModal from '../Components/ConfirmModal'
import '../styles/CreationsReview.css'

function CreationsReviewPage({ onBack, onPageReady }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      //Cargo la lista de creaciones pendientes y le agrego los nicks de los remitentes y la metadata de los comics.
      try {
        const list = await listPendingCreations()

        const userIds = Array.from(new Set(list.map((i) => i.UserID).filter(Boolean)))
        const nickMap = {}

        await Promise.all(userIds.map(async (uid) => {
          try {
            const profile = await getUserProfile(uid)
            nickMap[uid] = profile?.nick || ''
          } catch {
            nickMap[uid] = ''
          }
        }))

        const comicIdsToFetch = Array.from(new Set(
          list
            .filter((i) => i.tipo === 'tomos' && i.comicId)
            .map((i) => i.comicId),
        ))

        const comicMap = {}
        await Promise.all(comicIdsToFetch.map(async (cid) => {
          try {
            const comicData = await getComicById(cid)
            if (comicData) comicMap[cid] = comicData
          } catch {
          }
        }))

        const enriched = list.map((l) => ({
          ...l,
          remitenteNick: nickMap[l.UserID] || '',
          metadata: l.metadata || (l.tipo === 'tomos' && l.comicId ? (comicMap[l.comicId] ? {
            nombre: comicMap[l.comicId].nombre || '',
            autores: comicMap[l.comicId].autores || [],
            editorial: comicMap[l.comicId].editorial || '',
            paisEditorial: comicMap[l.comicId].paisEditorial || '',
            estado: comicMap[l.comicId].estado || '',
            generos: comicMap[l.comicId].generos || [],
            descripcion: comicMap[l.comicId].descripcion || '',
            formato: comicMap[l.comicId].formato || '',
          } : null) : l.metadata),
        }))

        if (!cancelled) setItems(enriched)
      } catch {
        if (!cancelled) setError('No fue posible cargar las creaciones pendientes.')
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  //Desestimo una creacion pendiente.
  const handleDismiss = async (id) => {
    try {
      await deletePendingCreation(id)
      setItems((currentItems) => currentItems.filter((item) => item.id !== id))
      setConfirmingId(null)
    } catch {
      setError('No fue posible desestimar la creación.')
    }
  }

  return (
    <main className="app-shell creations-review-page">
      <section className="app-card creations-review-page-card">
        <div className="creation-page-hero">
          <div>
            <h1>Creaciones de comics/tomos</h1>
            <p className="">Antes de aprobar una creación, asegúrate de que el comic o tomo no exista en el sistema.</p>
          </div>
        </div>

        {loading ? <p className="status-message creations-review-loading">Cargando...</p> : null}
        {error ? <p className="form-message error">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <p className="status-message">No hay creaciones pendientes para revisar</p>
        ) : null}

        <div className="creations-grid">
          {items.map((item) => (
            <article className="creation-card" key={item.id}>
              <header>
                <h3>{item.tipo === 'tomos' ? 'Tomos' : 'Comic y tomos'}</h3>
                <small>Enviado por: {item.remitenteNick || item.remitenteUid}</small>
              </header>

              <section className="metadata">
                {item.metadata ? (
                  <>
                    <p><strong>Comic:</strong> {item.metadata.nombre || 'Sin nombre'}</p>
                    <p><strong>Autores:</strong> {item.metadata.autores?.join(', ') || 'No definidos'}</p>
                    <p><strong>Editorial:</strong> {item.metadata.editorial || 'No definida'}</p>
                  </>
                ) : (
                  <p>No hay metadata disponible.</p>
                )}
              </section>

              <section className="covers">
                {Array.isArray(item.tomos) && item.tomos.slice(0, 2).map((tomo, idx) => (
                  <img key={idx} src={tomo.portada?.dataUrl || ''} alt={`Portada ${idx + 1}`} />
                ))}
                {Array.isArray(item.tomos) && item.tomos.length > 2 ? (
                  <div className="more-indicator">+{item.tomos.length - 2}</div>
                ) : null}
              </section>

              <footer>
                <button className="secondary-button" onClick={() => { window.history.pushState({}, '', `/admin/creations/${item.id}`); window.dispatchEvent(new PopStateEvent('popstate')) }}>Ver información</button>
                <button className="danger-button" onClick={() => setConfirmingId(item.id)}>Desestimar</button>
              </footer>
            </article>
          ))}
        </div>

        {confirmingId ? (
          <ConfirmModal
            title="Desestimar creación"
            message="¿Desestimar creación? Esta acción es irreversible."
            onCancel={() => setConfirmingId(null)}
            onConfirm={() => handleDismiss(confirmingId)}
          />
        ) : null}
      </section>
    </main>
  )
}

export default CreationsReviewPage
