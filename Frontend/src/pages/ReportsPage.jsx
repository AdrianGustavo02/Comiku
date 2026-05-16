import { useEffect, useState } from 'react'
import { getComicById, getComicVolumeById } from '../firebase/comics'
import {
  dismissReport,
  getDismissedReports,
  getPendingReports,
  getResolvedReports,
  resolveReport,
} from '../firebase/reports'
import { adminSearchChats, adminGetChannelDetails, adminDeleteChannel } from '../firebase/stream'
import { getUserProfile } from '../firebase/user'
import { getUsersNicksByUids } from '../firebase/user'
import '../styles/ReportsPage.css'

const SECTION_SIZE = 10

const INITIAL_SECTION_STATE = {
  items: [],
  lastId: null,
  hasMore: false,
  loading: false,
  error: '',
}

function createInitialSections() {
  return {
    pending: { ...INITIAL_SECTION_STATE },
    resolved: { ...INITIAL_SECTION_STATE },
    dismissed: { ...INITIAL_SECTION_STATE },
  }
}

function formatDate(value) {
  if (!value) {
    return 'Fecha no disponible'
  }

  try {
    return new Date(value).toLocaleString('es-AR')
  } catch {
    return 'Fecha no disponible'
  }
}

function formatAuthors(authors) {
  if (!Array.isArray(authors) || authors.length === 0) {
    return 'No definidos'
  }

  return authors.join(', ')
}

function isAdminRole(role) {
  return String(role || '').toLowerCase().includes('admin')
}

async function getReportObjectDetails(report) {
  const objectType = String(report.nombreObjetoReportado || '').toLowerCase()

  if (objectType === 'comic') {
    const comic = await getComicById(report.comicId || report.objetoReportadoId)

    return {
      objectType: 'comic',
      objectName: comic?.nombre || 'Comic no disponible',
      objectAuthors: formatAuthors(comic?.autores),
      objectCountry: comic?.paisEditorial || 'No definido',
      volumeNumber: null,
      screenshotUrl: report.capturaPantalla?.dataUrl || '',
    }
  }

  if (objectType === 'tomo') {
    const comicId = report.comicId || ''
    const [comic, volume] = await Promise.all([
      getComicById(comicId),
      comicId
        ? getComicVolumeById({ comicId, volumeId: report.objetoReportadoId })
        : Promise.resolve(null),
    ])

    return {
      objectType: 'tomo',
      objectName: comic?.nombre || 'Comic no disponible',
      objectAuthors: formatAuthors(comic?.autores),
      objectCountry: comic?.paisEditorial || 'No definido',
      volumeNumber: volume?.numeroTomo ?? null,
      screenshotUrl: report.capturaPantalla?.dataUrl || '',
    }
  }

  if (objectType === 'grupo de chat') {
    try {
      const payload = await adminGetChannelDetails({ channelId: report.objetoReportadoId })
      const channelData = payload?.channel?.data || null

      return {
        objectType: 'grupo de chat',
        objectName: channelData?.groupName || channelData?.name || 'Grupo no disponible',
        objectAuthors: `Miembros: ${Array.isArray(channelData?.members) ? channelData.members.length : 0}`,
        objectCountry: 'No aplica',
        volumeNumber: null,
        screenshotUrl: report.capturaPantalla?.dataUrl || '',
      }
    } catch {
      return {
        objectType: 'grupo de chat',
        objectName: 'Grupo no disponible',
        objectAuthors: 'No disponible',
        objectCountry: 'No definido',
        volumeNumber: null,
        screenshotUrl: report.capturaPantalla?.dataUrl || '',
      }
    }
  }

  const userProfile = await getUserProfile(report.objetoReportadoId).catch(() => null)

  return {
    objectType: 'usuario',
    objectName: userProfile?.nick || userProfile?.nombre || 'Usuario no disponible',
    objectAuthors: `${userProfile?.nombre || ''} ${userProfile?.apellido || ''}`.trim() || 'No definido',
    objectCountry: 'No aplica',
    volumeNumber: null,
    screenshotUrl: report.capturaPantalla?.dataUrl || '',
  }
}

async function enrichReports(reports) {
  return Promise.all(
    reports.map(async (report) => {
      try {
        const details = await getReportObjectDetails(report)
        return { ...report, ...details }
      } catch {
        return {
          ...report,
          objectType: String(report.nombreObjetoReportado || '').toLowerCase() || 'no definido',
          objectName: 'No disponible',
          objectAuthors: 'No disponibles',
          objectCountry: 'No definido',
          volumeNumber: null,
          screenshotUrl: report.capturaPantalla?.dataUrl || '',
        }
      }
    }),
  )
}

function reportKeyFromItem(report) {
  return `${report.id}-${report.estado || 'pending'}`
}

function ReportCard({ report, isExpanded, onToggleExpanded, onResolve, onDismiss, showActions }) {
  const infoLabel = report.objectType === 'tomo' ? 'tomo' : report.objectType || 'objeto'

  return (
    <article className="report-card">
      <div className="report-card-header">
        <div>
          <p className="report-card-eyebrow">Tipo de objeto: {infoLabel}</p>
          <h3>{report.objectName}</h3>
        </div>
        <span className="report-status-chip">{report.estado}</span>
      </div>

      <div className="report-card-summary">
        <p>
          <strong>Motivo:</strong> {report.motivo || report.Motivo || 'No disponible'}
        </p>
        {report.objectType === 'usuario' ? (
          <>
            <p>
              <strong>ID del usuario:</strong> {report.objetoReportadoId || 'No disponible'}
            </p>
          </>
        ) : report.objectType === 'grupo de chat' ? (
          <>
            <p>
              <strong>ID del grupo de chat:</strong> {report.objetoReportadoId || 'No disponible'}
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>Autor:</strong> {report.objectAuthors}
            </p>
            <p>
              <strong>País:</strong> {report.objectCountry}
            </p>
          </>
        )}
        {report.objectType === 'tomo' && report.volumeNumber !== null ? (
          <p>
            <strong>Número de tomo:</strong> {report.volumeNumber}
          </p>
        ) : null}
      </div>

      <button type="button" className="report-link-button" onClick={onToggleExpanded}>
        {isExpanded ? 'Ocultar información' : 'Ver mas informacion'}
      </button>

      {isExpanded ? (
        <div className="report-card-details">
          <p>
            <strong>Descripción:</strong> {report.descripcion || 'Sin descripción.'}
          </p>
          <p>
            <strong>Fecha de reporte:</strong> {formatDate(report.fechaReporte)}
          </p>
          {report.screenshotUrl ? (
            <div className="report-screenshot-card">
              <p className="report-screenshot-label">Captura de pantalla</p>
              <img
                src={report.screenshotUrl}
                alt="Captura adjunta al reporte"
                className="report-screenshot-image"
              />
            </div>
          ) : (
            <p className="helper-text">No se envió captura de pantalla.</p>
          )}
        </div>
      ) : null}

      {showActions ? (
        <div className="report-card-actions">
          <button type="button" className="report-action-button resolve" onClick={onResolve}>
            Marcar como resuelto
          </button>
          <button type="button" className="report-action-button dismiss" onClick={onDismiss}>
            Desestimar
          </button>
        </div>
      ) : null}
    </article>
  )
}

function ReportsSection({
  title,
  sectionKey,
  sectionState,
  onLoadMore,
  onToggleExpanded,
  expandedIds,
  onResolve,
  onDismiss,
  showActions,
}) {
  return (
    <section className="reports-panel">
      <div className="reports-section-header">
        <div>
          <p className="eyebrow">Comiku / Reportes</p>
          <h2>{title}</h2>
        </div>
        <span className="reports-counter">{sectionState.items.length}</span>
      </div>

      {sectionState.error ? <p className="form-message error">{sectionState.error}</p> : null}
      {sectionState.loading && sectionState.items.length === 0 ? (
        <p className="status-message">Cargando reportes...</p>
      ) : sectionState.items.length === 0 ? (
        <p className="helper-text">No hay reportes para mostrar.</p>
      ) : (
        <div className="reports-grid">
          {sectionState.items.map((report) => (
            <ReportCard
              key={reportKeyFromItem(report)}
              report={report}
              isExpanded={expandedIds.has(report.id)}
              onToggleExpanded={() => onToggleExpanded(report.id)}
              onResolve={onResolve ? () => onResolve(report) : undefined}
              onDismiss={onDismiss ? () => onDismiss(report) : undefined}
              showActions={showActions}
            />
          ))}
        </div>
      )}

      {sectionState.hasMore ? (
        <div className="reports-more-actions">
          <button
            type="button"
            className="reports-load-more-button"
            onClick={() => onLoadMore(sectionKey)}
            disabled={sectionState.loading}
          >
            {sectionState.loading ? 'Cargando...' : 'Cargar 10 más'}
          </button>
        </div>
      ) : sectionState.items.length > 0 ? (
        <p className="helper-text">No hay más reportes para mostrar.</p>
      ) : null}
    </section>
  )
}

function ReportsPage({ authUser, currentUserRole }) {
  const [sections, setSections] = useState(createInitialSections)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [confirmation, setConfirmation] = useState({
    open: false,
    action: '',
    report: null,
  })
  const [notice, setNotice] = useState('')
  const [pageError, setPageError] = useState('')
  const [searchId, setSearchId] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [selectedChannelMessages, setSelectedChannelMessages] = useState([])
  const [memberNicks, setMemberNicks] = useState({})
  const [adminProcessing, setAdminProcessing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, channelId: null })
  const [processing, setProcessing] = useState(false)

  const adminReady = currentUserRole !== null
  const isAdmin = isAdminRole(currentUserRole)

  const updateSection = (sectionKey, updater) => {
    setSections((current) => ({
      ...current,
      [sectionKey]: typeof updater === 'function' ? updater(current[sectionKey]) : updater,
    }))
  }

  const handleSearchChats = async () => {
    if (!searchId || !searchId.trim()) return
    setSearchLoading(true)
    setSearchResults([])
    setSelectedChannel(null)
    setSelectedChannelMessages([])

    try {
      const channels = await adminSearchChats({ id: searchId.trim() })
      setSearchResults(channels || [])
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No fue posible buscar chats')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleLoadChannelDetails = async (channelId) => {
    setAdminProcessing(true)
    setSelectedChannel(null)
    setSelectedChannelMessages([])
    setMemberNicks({})

    try {
      const payload = await adminGetChannelDetails({ channelId })
      if (payload && payload.ok) {
        const channel = payload.channel || null
        setSelectedChannel(channel)
        
        // Resolve member nicks
        const memberIds = channel?.data?.members || []
        if (memberIds.length > 0) {
          try {
            const nicks = await getUsersNicksByUids(memberIds)
            setMemberNicks(nicks)
          } catch (err) {
            console.error('[admin][debug] Error cargando nicks de miembros:', err)
          }
        }
        const messages = payload.messages || []

        // Enrich message authors with nicks from user DB when possible
        const userIds = Array.from(new Set(messages.map((m) => m.user?.id || m.user_id).filter(Boolean)))
        let nicksMap = {}
        if (userIds.length > 0) {
          try {
            nicksMap = await getUsersNicksByUids(userIds)
          } catch (err) {
            console.error('Error cargando nicks para mensajes:', err)
          }
        }

        const mapped = messages.map((m) => {
          const uid = m.user?.id || m.user_id || ''
          // Prefer nicksMap (Firestore nick) over m.user.name (which may be uid)
          const displayName = nicksMap[uid] || m.user?.name || uid || 'Usuario'
          return { ...m, displayName }
        })

        setSelectedChannelMessages(mapped)
      } else {
        setPageError(payload?.message || 'No se encontraron detalles del canal')
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No fue posible cargar detalles del canal')
    } finally {
      setAdminProcessing(false)
    }
  }

  const handleConfirmDeleteChannel = (channelId) => {
    setDeleteConfirm({ open: true, channelId })
  }

  const handleDeleteChannel = async () => {
    if (!deleteConfirm.channelId) return
    setAdminProcessing(true)
    try {
      await adminDeleteChannel({ channelId: deleteConfirm.channelId })
      setNotice('Grupo eliminado correctamente.')
      setSearchResults((s) => s.filter((c) => c.id !== deleteConfirm.channelId))
      if (selectedChannel?.id === deleteConfirm.channelId) {
        setSelectedChannel(null)
        setSelectedChannelMessages([])
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No fue posible eliminar el grupo')
    } finally {
      setAdminProcessing(false)
      setDeleteConfirm({ open: false, channelId: null })
    }
  }

  const toggleExpanded = (reportId) => {
    setExpandedIds((current) => {
      const next = new Set(current)

      if (next.has(reportId)) {
        next.delete(reportId)
      } else {
        next.add(reportId)
      }

      return next
    })
  }

  const loadSection = async (sectionKey, append = false) => {
    const loaders = {
      pending: getPendingReports,
      resolved: getResolvedReports,
      dismissed: getDismissedReports,
    }

    const loader = loaders[sectionKey]

    if (!loader) {
      return
    }

    updateSection(sectionKey, (section) => ({
      ...section,
      loading: true,
      error: '',
    }))

    try {
      const currentSection = sections[sectionKey]
      const { reports, lastId, hasMore } = await loader(SECTION_SIZE, append ? currentSection.lastId : null)
      const enrichedReports = await enrichReports(reports)

      updateSection(sectionKey, (section) => ({
        ...section,
        items: append ? [...section.items, ...enrichedReports] : enrichedReports,
        lastId,
        hasMore,
        loading: false,
        error: '',
      }))
    } catch (error) {
      updateSection(sectionKey, (section) => ({
        ...section,
        loading: false,
        error: error instanceof Error ? error.message : 'No fue posible cargar los reportes.',
      }))
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    let cancelled = false

    async function loadAllSections() {
      const sectionsToLoad = ['pending', 'resolved', 'dismissed']

      for (const sectionKey of sectionsToLoad) {
        if (cancelled) {
          return
        }

        await loadSection(sectionKey, false)
      }
    }

    loadAllSections()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.uid, currentUserRole])

  const openConfirmationModal = (report, action) => {
    setConfirmation({ open: true, action, report })
  }

  const closeConfirmationModal = () => {
    if (processing) {
      return
    }

    setConfirmation({ open: false, action: '', report: null })
  }

  const applyModeration = async () => {
    if (!confirmation.report || !authUser?.uid) {
      return
    }

    try {
      setProcessing(true)
      setPageError('')
      setNotice('')

      const actionHandler = confirmation.action === 'resolve' ? resolveReport : dismissReport
      const updatedReport = await actionHandler({
        reportId: confirmation.report.id,
        adminId: authUser.uid,
      })

      const sourceKey = 'pending'
      const targetKey = confirmation.action === 'resolve' ? 'resolved' : 'dismissed'

      updateSection(sourceKey, (section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== confirmation.report.id),
      }))

      updateSection(targetKey, (section) => ({
        ...section,
        items: [updatedReport, ...section.items],
      }))

      setExpandedIds((current) => {
        const next = new Set(current)
        next.delete(confirmation.report.id)
        return next
      })

      setNotice(
        confirmation.action === 'resolve'
          ? 'El reporte fue marcado como resuelto.'
          : 'El reporte fue desestimado.',
      )
      setConfirmation({ open: false, action: '', report: null })
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'No fue posible procesar el reporte.')
    } finally {
      setProcessing(false)
    }
  }

  if (!adminReady) {
    return (
      <main className="app-shell">
        <section className="app-card reports-page-card">
          <p className="status-message">Cargando permisos de administrador...</p>
        </section>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="app-shell">
        <section className="app-card reports-page-card">
          <p className="form-message error">No tienes permisos para ver esta sección.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="app-card reports-page-card">
        <header className="reports-page-hero">
          <div>
            <p className="eyebrow">Comiku / Administración</p>
            <h1>Reportes</h1>
            <p className="lead">
              Revisa los reportes pendientes, resueltos y desestimados desde un mismo panel.
            </p>
          </div>
        </header>

        <section style={{ marginTop: 18, marginBottom: 24 }}>
          <h3>Buscar chats</h3>
          <p className="helper-text">Ingresa el ID de usuario o el ID del grupo de chat para cargar los chats correspondientes.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input type="text" value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="ID de usuario o ID de grupo" style={{ flex: 1, padding: 8 }} />
            <button type="button" onClick={handleSearchChats} disabled={searchLoading} className="profile-back-button">{searchLoading ? 'Buscando...' : 'Buscar'}</button>
          </div>

          {searchResults.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <h4>Resultados</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {searchResults.map((c) => (
                  <li key={c.id} style={{ padding: 10, border: '1px solid #e6e6e6', borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{c.groupName || c.name || c.id}</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{(c.members || []).length} miembros — {c.type || c.streamType || 'group'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="profile-back-button" onClick={() => handleLoadChannelDetails(c.id)} disabled={adminProcessing}>Ver</button>
                      <button type="button" className="delete-account-button" onClick={() => handleConfirmDeleteChannel(c.id)} disabled={adminProcessing}>{c.type === 'personal' || (c.members || []).length === 2 ? 'Eliminar chat' : 'Eliminar grupo'}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedChannel ? (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid #e6e6e6', borderRadius: 8 }}>
              <h4>Canal: {selectedChannel.id}</h4>
              <p><strong>Nombre:</strong> {selectedChannel.data?.groupName || selectedChannel.data?.name || 'Sin nombre'}</p>
              <p><strong>Miembros:</strong> {(selectedChannel.data?.members || []).map((uid) => memberNicks[uid] || uid).join(', ')}</p>
              <div style={{ marginTop: 8 }}>
                <h5>Mensajes recientes</h5>
                {selectedChannelMessages.length === 0 ? <p className="helper-text">No hay mensajes disponibles.</p> : (
                  <ul style={{ listStyle: 'none', padding: 0, maxHeight: 240, overflowY: 'auto' }}>
                    {selectedChannelMessages.map((m, idx) => (
                      <li key={idx} style={{ padding: 8, borderBottom: '1px solid #f1f1f1' }}>
                        <div style={{ fontSize: 13 }}><strong>{m.displayName || m.user?.name || m.user?.id || m.user_id || 'Usuario'}</strong> — <span style={{ fontSize: 12, color: '#64748b' }}>{new Date(m.created_at).toLocaleString()}</span></div>
                        {m.text || m.message ? <div style={{ marginTop: 6 }}>{m.text || m.message}</div> : null}
                        {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {m.attachments.map((att, attIdx) => {
                              const type = att.type || ''
                              const url = att.image_url || att.asset_url || ''
                              if (type === 'image' && url) {
                                return <img key={attIdx} src={url} alt="attachment" style={{ maxWidth: '250px', maxHeight: 180, borderRadius: 6, objectFit: 'contain' }} />
                              }
                              if (type === 'audio' && url) {
                                return <div key={attIdx} style={{ maxWidth: '280px' }}><audio controls style={{ width: '100%' }} src={url} /></div>
                              }
                              if (url) {
                                return <a key={attIdx} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'underline' }}>{att.title || 'Descargar archivo'}</a>
                              }
                              return null
                            })}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {pageError ? <p className="form-message error">{pageError}</p> : null}
        {notice ? <p className="form-message success">{notice}</p> : null}

        <ReportsSection
          title="Reportes pendientes"
          sectionKey="pending"
          sectionState={sections.pending}
          onLoadMore={(sectionKey) => loadSection(sectionKey, true)}
          onToggleExpanded={toggleExpanded}
          expandedIds={expandedIds}
          onResolve={(report) => openConfirmationModal(report, 'resolve')}
          onDismiss={(report) => openConfirmationModal(report, 'dismiss')}
          showActions
        />

        <ReportsSection
          title="Reportes resueltos"
          sectionKey="resolved"
          sectionState={sections.resolved}
          onLoadMore={(sectionKey) => loadSection(sectionKey, true)}
          onToggleExpanded={toggleExpanded}
          expandedIds={expandedIds}
          showActions={false}
        />

        <ReportsSection
          title="Reportes desestimados"
          sectionKey="dismissed"
          sectionState={sections.dismissed}
          onLoadMore={(sectionKey) => loadSection(sectionKey, true)}
          onToggleExpanded={toggleExpanded}
          expandedIds={expandedIds}
          showActions={false}
        />
      </section>

      {confirmation.open ? (
        <div className="report-confirmation-backdrop" role="presentation" onClick={closeConfirmationModal}>
          <section
            className="report-confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-confirmation-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Confirmación</p>
            <h2 id="report-confirmation-title">
              {confirmation.action === 'resolve'
                ? 'Marcar como resuelto'
                : 'Desestimar reporte'}
            </h2>
            <p className="report-confirmation-text">
              {confirmation.action === 'resolve'
                ? '¿Seguro que deseas marcar este reporte como resuelto?'
                : '¿Seguro que deseas desestimar este reporte?'}
            </p>

            <div className="report-confirmation-actions">
              <button
                type="button"
                className="report-confirmation-button secondary"
                onClick={closeConfirmationModal}
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="report-confirmation-button primary"
                onClick={applyModeration}
                disabled={processing}
              >
                {processing ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {deleteConfirm.open ? (
        <div className="report-confirmation-backdrop" role="presentation" onClick={() => setDeleteConfirm({ open: false, channelId: null })}>
          <section
            className="report-confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-channel-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Confirmación</p>
            <h2 id="delete-channel-title">{deleteConfirm.channelId && searchResults.find((c) => c.id === deleteConfirm.channelId)?.type === 'personal' ? 'Eliminar chat' : 'Eliminar grupo'}</h2>
            <p className="report-confirmation-text">¿Seguro que deseas eliminar este {deleteConfirm.channelId && searchResults.find((c) => c.id === deleteConfirm.channelId)?.type === 'personal' ? 'chat' : 'grupo'}? Esta acción es irreversible.</p>

            <div className="report-confirmation-actions">
              <button type="button" className="report-confirmation-button secondary" onClick={() => setDeleteConfirm({ open: false, channelId: null })} disabled={adminProcessing}>
                Cancelar
              </button>
              <button type="button" className="report-confirmation-button primary" onClick={handleDeleteChannel} disabled={adminProcessing}>
                {adminProcessing ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default ReportsPage
