import { useState, useEffect, useRef } from 'react'
import { updateGroupChannel, addGroupMembers, makeGroupAdmin, leaveGroupChannel, removeGroupMember, adminDeleteChannel } from '../firebase/stream'
import { createReport, hasPendingObjectReport, REPORT_REASON_OPTIONS_FOR_GROUP } from '../firebase/reports'
import { ALLOWED_IMAGE_TYPES, MAX_COVER_SIZE_BYTES, createCompressedImageDataUrl, readFileAsDataUrl } from '../constants/imageUpload'
import { getUserFriends, getUsersNicksByUids } from '../firebase/user'

export default function GroupSettings({ channel, authUser, onClose = () => {}, onUpdated = () => {} }) {
  const members = channel?.data?.members || []
  const admins = channel?.data?.admins || []
  const isAdmin = authUser?.uid && admins.includes(authUser.uid)
  const [activeTab, setActiveTab] = useState('info')
  const [editMode, setEditMode] = useState(false)
  const [groupName, setGroupName] = useState(channel?.data?.groupName || channel?.data?.name || '')
  const [groupDescription, setGroupDescription] = useState(channel?.data?.groupDescription || '')
  const [groupImagePreview, setGroupImagePreview] = useState(channel?.data?.image || channel?.data?.groupImageUrl || null)
  const [groupImageUrl, setGroupImageUrl] = useState(channel?.data?.image || channel?.data?.groupImageUrl || null)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [friends, setFriends] = useState([])
  const [selectedFriendsToAdd, setSelectedFriendsToAdd] = useState([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [memberNicks, setMemberNicks] = useState({})
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletingGroup, setDeletingGroup] = useState(false)
  // report group state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS_FOR_GROUP[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportScreenshotFile, setReportScreenshotFile] = useState(null)
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState(null)
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState('')
  const reportScreenshotInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function loadMemberNicks() {
      const memberIds = channel?.data?.members || []
      if (memberIds.length === 0) {
        if (!cancelled) {
          setMemberNicks({})
        }
        return
      }

      try {
        const nicks = await getUsersNicksByUids(memberIds)
        if (!cancelled) {
          setMemberNicks(nicks)
        }
      } catch (error) {
        console.error('Error cargando nicks:', error)
      }
    }

    loadMemberNicks()
    setGroupName(channel?.data?.groupName || channel?.data?.name || '')
    setGroupDescription(channel?.data?.groupDescription || '')
    const currentImage = channel?.data?.image || channel?.data?.groupImageUrl

    setGroupImagePreview(currentImage || null)
    setGroupImageUrl(currentImage || null)

    return () => {
      cancelled = true
    }
  }, [channel?.id, channel?.data?.groupName, channel?.data?.name, channel?.data?.groupDescription, channel?.data?.image, channel?.data?.groupImageUrl, channel?.data?.members])

  useEffect(() => {
    if (activeTab !== 'members' || !isAdmin || !authUser?.uid) {
      return
    }

    async function handleLoadFriends() {
      try {
        setLoadingFriends(true)
        const friendsList = await getUserFriends(authUser.uid)
        const existingMembers = channel?.data?.members || []
        const availableFriends = friendsList.filter((friend) => !existingMembers.includes(friend.uid))
        setFriends(availableFriends)
      } catch {
        setErrors({ friends: 'No se pudieron cargar los amigos.' })
      } finally {
        setLoadingFriends(false)
      }
    }

    handleLoadFriends()
  }, [activeTab, isAdmin, authUser?.uid, channel?.data?.members])

  async function handleImageSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErrors({ ...errors, image: 'Formato no soportado. Usa JPG, PNG o WEBP.' })
      return
    }

    if (file.size > MAX_COVER_SIZE_BYTES) {
      setErrors({ ...errors, image: `Máximo 500KB. Tu archivo pesa ${Math.round(file.size / 1024)}KB.` })
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const compressedDataUrl = await createCompressedImageDataUrl(dataUrl)
      setGroupImagePreview(dataUrl)
      setGroupImageUrl(compressedDataUrl)
      setErrors({ ...errors, image: null })
    } catch {
      setErrors({ ...errors, image: 'No se pudo leer la imagen.' })
    }
  }

  function handleRemoveImage() {
    setGroupImagePreview(null)
    setGroupImageUrl(null)
    setErrors((currentErrors) => ({ ...currentErrors, image: null }))
  }

  async function handleSaveGroupInfo() {
    const newErrors = {}

    if (!groupName.trim()) {
      newErrors.name = 'El nombre del grupo es obligatorio.'
    } else if (groupName.trim().length > 100) {
      newErrors.name = 'Máximo 100 caracteres.'
    }

    if (groupDescription && groupDescription.length > 500) {
      newErrors.description = 'Máximo 500 caracteres.'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      setLoading(true)
      setErrors({})

      const imageToSend = groupImageUrl ? await createCompressedImageDataUrl(groupImageUrl) : null

      await updateGroupChannel({
        channelId: channel.id,
        groupName: groupName.trim(),
        groupDescription: groupDescription.trim(),
        groupImageUrl: imageToSend,
      })

      if (imageToSend !== groupImageUrl) {
        setGroupImagePreview(imageToSend)
        setGroupImageUrl(imageToSend)
      }

      await onUpdated()
      setSuccessMessage('Grupo actualizado correctamente.')
      setEditMode(false)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Error al actualizar grupo.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleAddMembers() {
    if (selectedFriendsToAdd.length === 0) {
      setErrors({ members: 'Selecciona al menos un amigo.' })
      return
    }

    try {
      setLoading(true)
      setErrors({})

      await addGroupMembers({
        channelId: channel.id,
        newMemberUids: selectedFriendsToAdd,
      })

      setSuccessMessage('Miembros agregados correctamente.')
      setSelectedFriendsToAdd([])
      setActiveTab('members')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrors({ members: err instanceof Error ? err.message : 'Error al agregar miembros.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleMakeAdmin(userUid) {
    try {
      setLoading(true)
      setErrors({})

      await makeGroupAdmin({
        channelId: channel.id,
        userUid,
      })

      setSuccessMessage('Usuario promovido a admin.')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrors({ admins: err instanceof Error ? err.message : 'Error al promover admin.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveMember(memberUid) {
    if (!window.confirm('¿Estás seguro de que quieres eliminar a este miembro del grupo?')) {
      return
    }

    try {
      setLoading(true)
      setErrors({})

      await removeGroupMember({
        channelId: channel.id,
        memberUid,
      })

      await onUpdated()
      setSuccessMessage('Miembro eliminado correctamente.')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrors({ members: err instanceof Error ? err.message : 'Error al eliminar miembro.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLeaveGroup() {
    if (!window.confirm('¿Estás seguro de que quieres abandonar el grupo?')) {
      return
    }

    try {
      setLoading(true)
      setErrors({})

      await leaveGroupChannel({
        channelId: channel.id,
      })

      setSuccessMessage('Has abandonado el grupo.')
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setErrors({ leave: err instanceof Error ? err.message : 'Error al abandonar grupo.' })
    } finally {
      setLoading(false)
    }
  }

  function openDeleteGroupModal() {
    setDeleteError('')
    setDeleteModalOpen(true)
  }

  function closeDeleteGroupModal() {
    if (deletingGroup) return
    setDeleteModalOpen(false)
  }

  async function handleDeleteGroup() {
    if (!channel?.id) {
      setDeleteError('Grupo inválido.')
      return
    }

    try {
      setDeletingGroup(true)
      setDeleteError('')
      await adminDeleteChannel({ channelId: channel.id })
      setDeleteModalOpen(false)
      setSuccessMessage('Grupo eliminado correctamente.')
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No fue posible eliminar el grupo.')
    } finally {
      setDeletingGroup(false)
    }
  }

  function handleReportScreenshotChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (reportScreenshotPreview) {
      try { URL.revokeObjectURL(reportScreenshotPreview) } catch { void 0 }
    }

    setReportScreenshotFile(file)
    setReportScreenshotPreview(URL.createObjectURL(file))
  }

  function closeReportModal() {
    if (isSubmittingReport) return
    setIsReportModalOpen(false)
    setReportDescription('')
    setReportScreenshotFile(null)
    setReportScreenshotPreview(null)
    setReportError('')
  }

  async function handleSubmitGroupReport(e) {
    e.preventDefault()
    setReportError('')

    try {
      if (!authUser?.uid) throw new Error('Debes iniciar sesion para enviar un reporte.')
      if (!channel?.id) throw new Error('Grupo invalido.')
      if (!reportDescription || !reportDescription.trim()) throw new Error('La descripcion del reporte es obligatoria.')

      setIsSubmittingReport(true)

      let captura = null
      if (reportScreenshotFile) {
        const dataUrl = await readFileAsDataUrl(reportScreenshotFile)
        captura = { dataUrl, fileName: reportScreenshotFile.name, contentType: reportScreenshotFile.type, sizeBytes: reportScreenshotFile.size }
      }

      await createReport({
        usuarioIdReporta: authUser.uid,
        objetoReportadoId: channel.id,
        nombreObjetoReportado: 'grupo de chat',
        motivo: reportReason,
        descripcion: reportDescription,
        capturaPantalla: captura,
      })

      setSuccessMessage('Reporte enviado correctamente.')
      closeReportModal()
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'No fue posible enviar el reporte.')
    } finally {
      setIsSubmittingReport(false)
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>{channel?.data?.name || 'Grupo'}</h2>
        <button type="button" onClick={onClose} style={{ padding: 8, cursor: 'pointer', border: 'none', background: 'none', fontSize: 20 }}>
          ✕
        </button>
      </div>

      {successMessage && (
        <p style={{ padding: 12, background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16 }}>
          {successMessage}
        </p>
      )}

      {isReportModalOpen ? (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} role="presentation" onClick={closeReportModal}>
          <div style={{ backgroundColor: 'white', borderRadius: 8, padding: 20, maxWidth: 600, width: '100%' }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Comiku / Reportar grupo</p>
            <h2>Reportar grupo</h2>

            {reportError ? <p className="form-message error">{reportError}</p> : null}

            <form className="report-form" onSubmit={handleSubmitGroupReport}>
              <label>Motivo</label>
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} disabled={isSubmittingReport}>
                {REPORT_REASON_OPTIONS_FOR_GROUP.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>

              <label>Descripción</label>
              <textarea value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} rows={4} placeholder="Describe brevemente el problema." disabled={isSubmittingReport} />

              <label>Captura de pantalla (opcional)</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleReportScreenshotChange}
                disabled={isSubmittingReport}
                ref={reportScreenshotInputRef}
                className="file-input-hidden"
              />
              <div className="file-input-control">
                <button
                  type="button"
                  className="file-input-trigger"
                  onClick={() => reportScreenshotInputRef.current?.click()}
                  disabled={isSubmittingReport}
                >
                  Seleccionar archivo
                </button>
                <span className={`file-input-name ${reportScreenshotFile?.name ? 'has-file' : ''}`}>
                  {reportScreenshotFile?.name || 'Sin archivo seleccionado'}
                </span>
              </div>

              {reportScreenshotPreview ? (
                <div className="report-screenshot-preview-card"><img src={reportScreenshotPreview} alt="Vista previa" className="report-screenshot-preview-image" /></div>
              ) : null}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="profile-back-button" onClick={closeReportModal} disabled={isSubmittingReport}>Cancelar</button>
                <button type="submit" className="delete-account-button" disabled={isSubmittingReport}>{isSubmittingReport ? 'Enviando reporte...' : 'Enviar reporte'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {errors.submit && (
        <p style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {errors.submit}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'info' ? 700 : 400,
            borderBottom: activeTab === 'info' ? '2px solid #0f172a' : 'none',
            color: activeTab === 'info' ? '#0f172a' : '#64748b',
          }}
        >
          Información
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('members')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'members' ? 700 : 400,
            borderBottom: activeTab === 'members' ? '2px solid #0f172a' : 'none',
            color: activeTab === 'members' ? '#0f172a' : '#64748b',
          }}
        >
          Miembros ({members.length})
        </button>
      </div>

      {activeTab === 'info' && (
        <div>
          {!editMode ? (
            <div>
              {groupImagePreview ? (
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <img
                    src={groupImagePreview}
                    alt={groupName || 'Grupo'}
                    style={{ width: 120, height: 120, borderRadius: 12, objectFit: 'cover', background: '#f1f5f9' }}
                  />
                </div>
              ) : (
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      margin: '0 auto',
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                      fontSize: 42,
                      fontWeight: 700,
                    }}
                  >
                    {(groupName.trim()[0] || 'G').toUpperCase()}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 14, color: '#64748b' }}>Nombre</p>
                <p style={{ fontSize: 16, fontWeight: 600 }}>{groupName || 'Sin nombre'}</p>
              </div>
              {groupDescription && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 14, color: '#64748b' }}>Descripción</p>
                  <p style={{ fontSize: 14 }}>{groupDescription}</p>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 14, color: '#64748b' }}>Creado por</p>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {channel?.data?.createdBy === authUser?.uid ? 'Tú' : 'Otro usuario'}
                </p>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  style={{
                    marginTop: 16,
                    padding: '10px 16px',
                    background: '#1d4ed8',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginRight: 10,
                  }}
                >
                  Editar información
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={openDeleteGroupModal}
                  style={{
                    marginTop: 16,
                    padding: '10px 16px',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginRight: 10,
                  }}
                >
                  Eliminar grupo
                </button>
              )}

              <button
                type="button"
                onClick={handleLeaveGroup}
                disabled={loading}
                style={{
                  marginTop: 16,
                  padding: '10px 16px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Abandonando...' : 'Abandonar grupo'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setReportError('')
                  // verificar si hay pendiente
                  try {
                    const hasPending = await hasPendingObjectReport({ usuarioIdReporta: authUser?.uid, objetoReportadoId: channel.id, nombreObjetoReportado: 'grupo de chat' })
                    if (hasPending) setReportError('Ya tienes un reporte pendiente para este grupo. Podrás volver a reportarlo cuando se resuelva.')
                  } catch {
                    // ignore
                  }
                  setIsReportModalOpen(true)
                }}
                disabled={loading}
                style={{
                  marginTop: 16,
                  padding: '10px 16px',
                  background: '#f97316',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  marginLeft: 8,
                }}
              >
                Reportar grupo
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Nombre *</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  style={{ width: '100%', padding: 10, border: '1px solid #d7d7d7', borderRadius: 8, fontSize: 14 }}
                  maxLength={100}
                />
                {errors.name && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{errors.name}</p>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Descripción</label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #d7d7d7',
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: 80,
                  }}
                  maxLength={500}
                />
                {errors.description && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{errors.description}</p>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Foto</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => document.getElementById('group-settings-image')?.click()}
                    style={{
                      padding: '10px 16px',
                      background: '#0f172a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    Cambiar foto
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    style={{
                      padding: '10px 16px',
                      background: '#f1f5f9',
                      color: '#334155',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    Eliminar foto
                  </button>
                </div>
                <input
                  id="group-settings-image"
                  type="file"
                  accept={ALLOWED_IMAGE_TYPES.join(',')}
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
                {errors.image && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{errors.image}</p>}
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  {groupImagePreview ? (
                    <img
                      src={groupImagePreview}
                      alt={groupName}
                      style={{ width: 140, height: 140, borderRadius: 14, objectFit: 'cover', background: '#f1f5f9' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 140,
                        height: 140,
                        margin: '0 auto',
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0f172a',
                        fontSize: 48,
                        fontWeight: 700,
                      }}
                    >
                      {(groupName.trim()[0] || 'G').toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={handleSaveGroupInfo}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#1d4ed8',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#f1f5f9',
                    color: '#334155',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'members' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Miembros</h3>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 20 }}>
              {members.map((memberId) => {
                const memberIsAdmin = admins.includes(memberId)
                const isCurrentUser = memberId === authUser?.uid

                return (
                  <li key={memberId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 8 }}>
                    <div>
                      <p style={{ fontWeight: 600 }}>{isCurrentUser ? 'Tú' : memberNicks[memberId] || memberId}</p>
                      {memberIsAdmin && <p style={{ fontSize: 12, color: '#64748b' }}>Admin</p>}
                    </div>
                    {isAdmin && !isCurrentUser && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!memberIsAdmin && (
                          <button
                            type="button"
                            onClick={() => handleMakeAdmin(memberId)}
                            disabled={loading}
                            style={{
                              padding: '6px 12px',
                              background: '#fbbf24',
                              color: '#000',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              opacity: loading ? 0.7 : 1,
                            }}
                          >
                            Hacer admin
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(memberId)}
                          disabled={loading}
                          style={{
                            padding: '6px 12px',
                            background: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            opacity: loading ? 0.7 : 1,
                          }}
                        >
                          Eliminar miembro
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {isAdmin && (
            <div>
              <h3 style={{ marginBottom: 12 }}>Agregar miembros</h3>
              {friends.length === 0 ? (
                <p style={{ color: '#64748b', marginBottom: 16 }}>
                  {loadingFriends ? 'Cargando amigos...' : 'No hay amigos disponibles para agregar.'}
                </p>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12, maxHeight: 200, overflowY: 'auto' }}>
                    {friends.map((friend) => (
                      <li key={friend.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: '#f8fafc', borderRadius: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 500 }}>{friend.nick}</span>
                        <input
                          type="checkbox"
                          checked={selectedFriendsToAdd.includes(friend.uid)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFriendsToAdd([...selectedFriendsToAdd, friend.uid])
                            } else {
                              setSelectedFriendsToAdd(selectedFriendsToAdd.filter((uid) => uid !== friend.uid))
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>

                  {errors.members && <p style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{errors.members}</p>}

                  <button
                    type="button"
                    onClick={handleAddMembers}
                    disabled={loading || selectedFriendsToAdd.length === 0}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: 600,
                      opacity: loading || selectedFriendsToAdd.length === 0 ? 0.7 : 1,
                    }}
                  >
                    {loading ? 'Agregando...' : `Agregar ${selectedFriendsToAdd.length} miembro(s)`}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isAdmin && (
            <button
              type="button"
              onClick={handleLeaveGroup}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                marginTop: 16,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Abandonando...' : 'Abandonar grupo'}
            </button>
          )}
        </div>
      )}

      {deleteModalOpen ? (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} role="presentation" onClick={closeDeleteGroupModal}>
          <div style={{ backgroundColor: 'white', borderRadius: 8, padding: 20, maxWidth: 520, width: '100%' }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Comiku / Eliminar grupo</p>
            <h2>Eliminar grupo</h2>
            <p className="confirm-modal-text">Esta acción eliminará el grupo, sus mensajes y su información asociada.</p>
            {deleteError ? <p className="form-message error">{deleteError}</p> : null}

            <div className="confirm-modal-actions">
              <button type="button" className="profile-back-button" onClick={closeDeleteGroupModal} disabled={deletingGroup}>Cancelar</button>
              <button type="button" className="delete-account-button" onClick={handleDeleteGroup} disabled={deletingGroup}>{deletingGroup ? 'Eliminando...' : 'Eliminar grupo'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
