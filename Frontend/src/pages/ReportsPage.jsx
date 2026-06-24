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
    const date = value?.toDate ? value.toDate() : new Date(value)
    return date.toLocaleDateString('es-AR')
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

function isPersonalChatResult(channel) {
  if (!channel) {
    return false
  }

  if (channel.type === 'personal' || channel.streamType === 'personal') {
    return true
  }

  if (channel.type === 'group' || channel.streamType === 'group') {
    return false
  }

  return !channel.groupName && !channel.groupImageUrl && !channel.image && (channel.members || []).length === 2
}

async function getReportObjectDetails(report) {
  const objectType = String(report.nombreObjetoReportado || '').toLowerCase()

  //Si el objeto reportado es un comic, cargo los detalles del comic.
  if (objectType === 'comic') {
    const comic = await getComicById(report.comicId || report.objetoReportadoId)

    return {
      objectType: 'comic',
      objectName: comic?.nombre || 'Comic no disponible',
      objectAuthors: formatAuthors(comic?.autores),
      objectCountry: comic?.paisEditorial || 'No definido',
      objectEditorial: comic?.editorial || 'No definido',
      volumeNumber: null,
      screenshotUrl: report.capturaPantalla?.dataUrl || '',
    }
  }

  //Si el objeto reportado es un tomo, cargo los detalles del comic y del tomo.
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
      objectEditorial: comic?.editorial || 'No definido',
      volumeNumber: volume?.numeroTomo ?? null,
      screenshotUrl: report.capturaPantalla?.dataUrl || '',
    }
  }

  //Si el objeto reportado es un grupo de chat, 
  // cargo los detalles del grupo para mostrar el nombre y la cantidad de miembros.
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
      //Intento cargar los detalles del objeto reportado.
      try {
        const details = await getReportObjectDetails(report)
        try {
          const reporterProfile = await getUserProfile(report.usuarioIdReporta)
          const reporterNick = reporterProfile?.nick || reporterProfile?.nombre || report.usuarioIdReporta
          return { ...report, ...details, reporterNick }
        } catch {
          return { ...report, ...details, reporterNick: report.usuarioIdReporta }
        }
      } catch {
        return {
          ...report,
          objectType: String(report.nombreObjetoReportado || '').toLowerCase() || 'no definido',
          objectName: 'No disponible',
          objectAuthors: 'No disponibles',
          objectCountry: 'No definido',
          volumeNumber: null,
          screenshotUrl: report.capturaPantalla?.dataUrl || '',
          reporterNick: report.usuarioIdReporta,
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
  const [resolvedReporterNick, setResolvedReporterNick] = useState(report.reporterNick || '')

  useEffect(() => {
    let cancelled = false

    async function resolveNick() {
      if (resolvedReporterNick) return
      try {
        const profile = await getUserProfile(report.usuarioIdReporta)
        if (cancelled) return
        const nick = profile?.nick || profile?.nombre || ''
        if (nick) setResolvedReporterNick(nick)
      } catch {
      }
    }

    resolveNick()

    return () => {
      cancelled = true
    }
  }, [report.usuarioIdReporta, resolvedReporterNick])

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
              <strong>Nick del usuario:</strong> {report.objectName || 'No disponible'}
            </p>
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
              <strong>Editorial:</strong> {report.objectEditorial || 'No definido'}
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
                <strong>Reportado por:</strong> {resolvedReporterNick || report.reporterNick || report.usuarioIdReporta}
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
          <h2>{title}</h2>
        </div>
        <span className="reports-counter">{sectionState.items.length}</span>
      </div>

      {sectionState.error ? <p className="form-message error">{sectionState.error}</p> : null}
      {sectionState.loading && sectionState.items.length === 0 ? (
        <p className="status-message">Cargando reportes...</p>
      ) : sectionState.items.length === 0 ? (
        <p className="status-message">No hay reportes para mostrar.</p>
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
            {sectionState.loading ? 'Cargando...' : 'Cargar mas reportes'}
          </button>
        </div>
      ) : sectionState.items.length > 0 ? (
        <p className="status-message">No hay mas reportes</p>
      ) : null}
    </section>
  )
}

function ReportsPage({ authUser, currentUserRole, onPageReady }) {
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
  const [searchAttempted, setSearchAttempted] = useState(false)
  const [searchTargetNick, setSearchTargetNick] = useState('')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [selectedChannelMessages, setSelectedChannelMessages] = useState([])
  const [memberNicks, setMemberNicks] = useState({})
  const [adminProcessing, setAdminProcessing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, channelId: null })
  const [processing, setProcessing] = useState(false)
  const [selectedSection, setSelectedSection] = useState('pending')

  const adminReady = currentUserRole !== null
  const isAdmin = isAdminRole(currentUserRole)
  const isSelectedChannelGroup = Boolean(
    selectedChannel?.data?.type === 'group'
      || selectedChannel?.data?.groupName
      || selectedChannel?.data?.groupImageUrl
      || (selectedChannel?.data?.members || []).length > 2,
  )

  const updateSection = (sectionKey, updater) => {
    setSections((current) => ({
      ...current,
      [sectionKey]: typeof updater === 'function' ? updater(current[sectionKey]) : updater,
    }))
  }

  const handleSearchChats = async () => {
    if (!searchId || !searchId.trim()) return
    setSearchLoading(true)
    setSearchAttempted(true)
    setSearchTargetNick('')
    setSearchResults([])
    setSelectedChannel(null)
    setSelectedChannelMessages([])

    try {
      const searchValue = searchId.trim()
      const channels = await adminSearchChats({ id: searchValue })
      setSearchResults(channels || [])

      //Si el resultado es un chat personal, obtengo el nick del usuario para mostrarlo.
      if (Array.isArray(channels) && channels.some((channel) => isPersonalChatResult(channel))) {
        try {
          const profile = await getUserProfile(searchValue)
          setSearchTargetNick(profile?.nick || profile?.nombre || '')
        } catch {
          setSearchTargetNick('')
        }
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No fue posible buscar chats')
    } finally {
      setSearchLoading(false)
    }
  }

  //Carga los detalles de un chat, los mensajes y los miembros.
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
        
        //Cargo los nicks de los miembros del canal.
        const memberIds = channel?.data?.members || []
        if (memberIds.length > 0) {
          try {
            const nicks = await getUsersNicksByUids(memberIds)
            setMemberNicks(nicks)
          } catch (err) {
            console.error('Error cargando nicks de los miembros:', err)
          }
        }
        const messages = payload.messages || []

        //Cargo los nicks de los usuarios que enviaron mensajes, para mostrar el nombre en vez del ID.
        const userIds = Array.from(new Set(messages.map((m) => m.user?.id || m.user_id).filter(Boolean)))
        let nicksMap = {}
        if (userIds.length > 0) {
          try {
            nicksMap = await getUsersNicksByUids(userIds)
          } catch (err) {
            console.error('Error cargando nicks para los mensajes:', err)
          }
        }

        const mapped = messages.map((m) => {
          const uid = m.user?.id || m.user_id || ''
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

  //Elimino un chat o grupo de chat. Si el chat eliminado es el que se está viendo, 
  // limpio la informacion para evitar mostrar un chat eliminado.
  const handleDeleteChannel = async () => {
    if (!deleteConfirm.channelId) return
    setAdminProcessing(true)
    try {
      await adminDeleteChannel({ channelId: deleteConfirm.channelId })
      setNotice('Chat eliminado correctamente.')
      setSearchResults((s) => s.filter((c) => c.id !== deleteConfirm.channelId))
      if (selectedChannel?.id === deleteConfirm.channelId) {
        setSelectedChannel(null)
        setSelectedChannelMessages([])
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'No fue posible eliminar el chat')
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

    //Hace la carga de los reportes, los enriquezco con su informacion.
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

  //Al cargar la página, si el usuario es admin, carga la sección seleccionada.
  useEffect(() => {
    if (!isAdmin) {
      return
    }
    let cancelled = false

    async function loadSelected() {
      if (cancelled) return
      await loadSection(selectedSection, false)
    }

    loadSelected().then(() => {
      if (typeof onPageReady === 'function') onPageReady()
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, currentUserRole, selectedSection])


  useEffect(() => {
    if (adminReady && !isAdmin && typeof onPageReady === 'function') {
      onPageReady()
    }
  }, [adminReady, isAdmin])

  //Cada vez que se cambia de sección, si la sección no tiene items y no está cargando, carga los items. 
  // Esto es para evitar cargar las 3 secciones al mismo tiempo al entrar a la página, 
  // y solo cargar la sección que el admin quiera ver.
  useEffect(() => {
    if (!isAdmin) return
    const sec = sections[selectedSection]
    if (sec && sec.items.length === 0 && !sec.loading) {
      void loadSection(selectedSection, false)
    }
  }, [selectedSection])

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

  const currentSection = sections[selectedSection]
  if (currentSection && currentSection.loading && currentSection.items.length === 0) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card">
          <p className="status-message">Cargando reportes...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell reports-page">
      <section className="app-card reports-page-card">
        <header className="reports-page-hero">
          <div>
            <h1>Reportes</h1>
          </div>
        </header>

        <section className="reports-chat-search">
          <h3>Buscar chats</h3>
          <p className="helper-text-white">Ingresa el ID de usuario o el ID del grupo de chat para cargar los chats correspondientes.</p>
          <div className="reports-chat-search-row">
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="ID de usuario o ID de grupo"
              className="reports-chat-search-input"
            />
            <button type="button" onClick={handleSearchChats} disabled={searchLoading} className="reports-chat-search-button">
              {searchLoading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {searchAttempted && !searchLoading && searchResults.length === 0 ? (
            <p className="status-message" style={{ marginTop: 12 }}>No se encontraron resultados</p>
          ) : null}

          {searchResults.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <h4>Resultados</h4>
              <ul className="channel-results-list">
                {searchResults.map((c) => (
                  <li className="channel-results" key={c.id}>
                    <div>
                      <strong>{isPersonalChatResult(c) ? (searchTargetNick || c.groupName || c.name || c.id) : (c.groupName || c.name || c.id)}</strong>
                      <div className="channel-results-info">
                        {(c.members || []).length} miembros — {isPersonalChatResult(c) ? 'Chat individual' : 'Grupo de chat'}
                      </div>
                    </div>
                    <div className="channel-results-actions">
                      <button type="button" className="profile-back-button" onClick={() => handleLoadChannelDetails(c.id)} disabled={adminProcessing}>Ver</button>
                      <button type="button" className="delete-account-button" onClick={() => handleConfirmDeleteChannel(c.id)} disabled={adminProcessing}>{isPersonalChatResult(c) ? 'Eliminar chat' : 'Eliminar grupo'}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedChannel ? (
            <div className='selected-channel-report'>
              <h4>Canal: {selectedChannel.id}</h4>
              {isSelectedChannelGroup ? (
                <p><strong>Nombre:</strong> {selectedChannel.data?.groupName || selectedChannel.data?.name || 'Sin nombre'}</p>
              ) : null}
              <p><strong>Miembros:</strong> {(selectedChannel.data?.members || []).map((uid) => memberNicks[uid] || uid).join(', ')}</p>
              <div style={{ marginTop: 8 }}>
                <h5>Mensajes recientes</h5>
                {selectedChannelMessages.length === 0 ? <p className="helper-text">No hay mensajes disponibles.</p> : (
                  <ul className="selected-channel-report-messages">
                    {selectedChannelMessages.map((m, idx) => (
                      <li className="selected-channel-report-message" key={idx}>
                        <div style={{ fontSize: 13 }}>
                          <strong>{m.displayName || m.user?.name || m.user?.id || m.user_id || 'Usuario'}</strong> 
                          — 
                          <span className='selected-channel-report-message-timestamp'>{new Date(m.created_at).toLocaleString()}</span>
                          </div>
                        {m.text || m.message ? <div style={{ marginTop: 6 }}>{m.text || m.message}</div> : null}
                        {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                          <div className='selected-channel-report-message-attachments'>
                            {m.attachments.map((att, attIdx) => {
                              const type = att.type || ''
                              const url = att.image_url || att.asset_url || ''
                              if (type === 'image' && url) {
                                return <img className='selected-channel-report-message-attachment-image' key={attIdx} src={url} alt="attachment"/>
                              }
                              if (type === 'audio' && url) {
                                return <div className='selected-channel-report-message-attachment-audio' key={attIdx}>
                                          <audio controls style={{ width: '100%' }} src={url} />
                                        </div>
                              }
                              if (url) {
                                return <a className='selected-channel-report-message-attachment-link' key={attIdx} href={url} target="_blank" rel="noopener noreferrer">{att.title || 'Descargar archivo'}</a>
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`profile-back-button ${selectedSection === 'pending' ? 'active' : ''}`}
            onClick={() => setSelectedSection('pending')}
          >
            Reportes pendientes
          </button>
          <button
            type="button"
            className={`profile-back-button ${selectedSection === 'resolved' ? 'active' : ''}`}
            onClick={() => setSelectedSection('resolved')}
          >
            Reportes resueltos
          </button>
          <button
            type="button"
            className={`profile-back-button ${selectedSection === 'dismissed' ? 'active' : ''}`}
            onClick={() => setSelectedSection('dismissed')}
          >
            Reportes desestimados
          </button>
        </div>

        <ReportsSection
          title={
            selectedSection === 'pending'
              ? 'Reportes pendientes'
              : selectedSection === 'resolved'
              ? 'Reportes resueltos'
              : 'Reportes desestimados'
          }
          sectionKey={selectedSection}
          sectionState={sections[selectedSection]}
          onLoadMore={() => loadSection(selectedSection, true)}
          onToggleExpanded={toggleExpanded}
          expandedIds={expandedIds}
          onResolve={selectedSection === 'pending' ? (report) => openConfirmationModal(report, 'resolve') : undefined}
          onDismiss={selectedSection === 'pending' ? (report) => openConfirmationModal(report, 'dismiss') : undefined}
          showActions={selectedSection === 'pending'}
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
