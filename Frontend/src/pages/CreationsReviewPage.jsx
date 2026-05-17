import { useEffect, useState } from 'react'
import { listPendingCreations, deletePendingCreation } from '../firebase/pendingCreations'
import { getComicById } from '../firebase/comics'
import { getUserProfile } from '../firebase/user'
import ConfirmModal from '../Components/ConfirmModal'
import '../styles/CreationsReview.css'

function CreationsReviewPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const list = await listPendingCreations()

        // resolve nicks for user ids
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

        // For pending creations of type 'tomos', try to fetch comic metadata when not provided
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
            // ignore fetch errors
          }
        }))

        const enriched = list.map((l) => ({
          ...l,
          remitenteNick: nickMap[l.UserID] || '',
          // if metadata is missing and we have comicId for tomos, use fetched comic metadata
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
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const handleDismiss = async (id) => {
    try {
      await deletePendingCreation(id)
      setItems((s) => s.filter((i) => i.id !== id))
      setConfirmingId(null)
    } catch {
      setError('No fue posible desestimar la creación.')
    }
  }

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-hero">
          <div>
            <p className="eyebrow">Admin / Creations</p>
            <h1>Pending creations</h1>
            <p className="lead">Antes de aprobar una creación, asegúrate de que el comic o tomo no exista en el sistema.</p>
          </div>
          <div className="hero-actions">
            <button className="back-button" onClick={onBack} type="button">Volver</button>
          </div>
        </div>

        {loading ? <p className="status-message">Cargando...</p> : null}
        {error ? <p className="form-message error">{error}</p> : null}

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
