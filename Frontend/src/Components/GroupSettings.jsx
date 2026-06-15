import { useState, useEffect, useRef } from 'react'
import { updateGroupChannel, addGroupMembers, makeGroupAdmin, leaveGroupChannel, removeGroupMember, adminDeleteChannel } from '../firebase/stream'
import { createReport, hasPendingObjectReport, REPORT_REASON_OPTIONS_FOR_GROUP } from '../firebase/reports'
import { ALLOWED_IMAGE_TYPES, MAX_COVER_SIZE_BYTES, createCompressedImageDataUrl, readFileAsDataUrl } from '../constants/imageUpload'
import { getUserFriends, getUsersNicksByUids } from '../firebase/user'
import FileInput from './FileInput'
import CoverPreview from './CoverPreview'
import Button from './Button'
import ConfirmModal from './ConfirmModal'
import '../styles/Modal.css'
import './GroupSettings.css'

export default function GroupSettings({ channel, authUser, onClose = () => {}, onUpdated = () => {}, onOpenProfile = () => {} }) {
  const members = channel?.data?.members || []
  const admins = channel?.data?.admins || []
  const isAdmin = authUser?.uid && admins.includes(authUser.uid)
  const isSoleAdmin = Boolean(isAdmin && admins.length === 1)
  const [activeTab, setActiveTab] = useState('info')
  const [editMode, setEditMode] = useState(false)
  const [groupName, setGroupName] = useState(channel?.data?.groupName || channel?.data?.name || '')
  const [groupDescription, setGroupDescription] = useState(channel?.data?.groupDescription || '')
  const [groupImagePreview, setGroupImagePreview] = useState(channel?.data?.image || channel?.data?.groupImageUrl || null)
  const [groupImageUrl, setGroupImageUrl] = useState(channel?.data?.image || channel?.data?.groupImageUrl || null)
  const [groupImageFileName, setGroupImageFileName] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [friends, setFriends] = useState([])
  const [selectedFriendsToAdd, setSelectedFriendsToAdd] = useState([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [showAddMembersPanel, setShowAddMembersPanel] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [memberNicks, setMemberNicks] = useState({})
  const [openMemberMenuId, setOpenMemberMenuId] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  // report group state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS_FOR_GROUP[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportScreenshotFile, setReportScreenshotFile] = useState(null)
  const [reportScreenshotPreview, setReportScreenshotPreview] = useState(null)
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState('')
  const reportDialogRef = useRef(null)
  const deleteDialogRef = useRef(null)

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
    setGroupImageFileName('')

    return () => {
      cancelled = true
    }
  }, [channel?.id, channel?.data?.groupName, channel?.data?.name, channel?.data?.groupDescription, channel?.data?.image, channel?.data?.groupImageUrl, channel?.data?.members])

  useEffect(() => {
    if (activeTab !== 'members' || !isAdmin || !authUser?.uid || !showAddMembersPanel) {
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
  }, [activeTab, isAdmin, authUser?.uid, channel?.data?.members, showAddMembersPanel])

  useEffect(() => {
    if (!isReportModalOpen) {
      return
    }

    reportDialogRef.current?.focus({ preventScroll: false })
    reportDialogRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [isReportModalOpen])

  useEffect(() => {
    if (!deleteModalOpen) {
      return
    }

    deleteDialogRef.current?.focus({ preventScroll: false })
    deleteDialogRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [deleteModalOpen])

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
      setGroupImageFileName(file.name || 'Imagen seleccionada')
      setErrors({ ...errors, image: null })
    } catch {
      setErrors({ ...errors, image: 'No se pudo leer la imagen.' })
    }
  }

  function handleRemoveImage() {
    setGroupImagePreview(null)
    setGroupImageUrl(null)
    setGroupImageFileName('')
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
      setShowAddMembersPanel(false)
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

  function toggleMemberMenu(memberUid) {
    setOpenMemberMenuId((currentOpenMemberMenuId) => (currentOpenMemberMenuId === memberUid ? '' : memberUid))
  }

  function closeMemberMenu() {
    setOpenMemberMenuId('')
  }

  async function handleLeaveGroup() {
    if (!channel?.id) {
      setErrors({ leave: 'Grupo inválido.' })
      return
    }

    try {
      setLoading(true)
      setErrors({})

      await leaveGroupChannel({
        channelId: channel.id,
      })

      setSuccessMessage('Has abandonado el grupo.')
      setLeaveModalOpen(false)
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
    <div className="group-settings">
      <div className="group-settings-header">
        <h2>{channel?.data?.name || 'Grupo'}</h2>
        <button type="button" onClick={onClose} className="group-settings-close-btn">
          ✕
        </button>
      </div>

      {successMessage && (
        <p className="group-settings-success">{successMessage}</p>
      )}

      {isReportModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeReportModal}>
          <div ref={reportDialogRef} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Reportar grupo</h3>
            </header>

            <div className="modal-body">
              {reportError ? <p className="form-message error">{reportError}</p> : null}

              <form className="report-form" onSubmit={handleSubmitGroupReport}>
                <label>Motivo</label>
                <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} disabled={isSubmittingReport}>
                  {REPORT_REASON_OPTIONS_FOR_GROUP.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>

                <label>Descripción</label>
                <textarea value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} rows={4} placeholder="Describe brevemente el problema." disabled={isSubmittingReport} />

                <label>Captura de pantalla (opcional)</label>
                <FileInput
                  id="report-screenshot"
                  accept=".jpg,.jpeg,.png,.webp"
                  onFileChange={(file) => handleReportScreenshotChange({ target: { files: file ? [file] : [] } })}
                  disabled={isSubmittingReport}
                  initialFileName={reportScreenshotFile?.name}
                />

                {reportScreenshotPreview ? (
                  <div className="report-screenshot-preview-card"><img src={reportScreenshotPreview} alt="Vista previa" className="report-screenshot-preview-image" /></div>
                ) : null}

                <div className="modal-footer">
                  <button className="secondary-button" type="button" onClick={closeReportModal} disabled={isSubmittingReport}>Cancelar</button>
                  <button className="danger-button" type="submit" disabled={isSubmittingReport}>{isSubmittingReport ? 'Enviando reporte...' : 'Enviar reporte'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {errors.submit && (
        <p className="group-settings-error">{errors.submit}</p>
      )}

      <div className="group-settings-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`group-settings-tab ${activeTab === 'info' ? 'active' : ''}`}
        >
          Información
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={`group-settings-tab ${activeTab === 'members' ? 'active' : ''}`}
        >
          Miembros ({members.length})
        </button>
      </div>

      {activeTab === 'info' && (
        <div>
          {!editMode ? (
            <div>
              <div className="group-info-header">
                {groupImagePreview ? (
                  <img
                    src={groupImagePreview}
                    alt={groupName || 'Grupo'}
                    className="group-info-avatar-img"
                  />
                ) : (
                  <div className="group-info-avatar-fallback">
                    {(groupName.trim()[0] || 'G').toUpperCase()}
                  </div>
                )}

                <div className="group-info-header-text">
                  <div>
                    {/* <p className="group-info-field-label">Nombre</p> */}
                    <p className="group-info-field-value">{groupName || 'Sin nombre'}</p>
                  </div>
                  <div>
                    <p className="group-info-field-label">Creado por</p>
                    <p className="group-info-field-value">
                      {channel?.data?.createdBy === authUser?.uid ? 'Tú' : 'Otro usuario'}
                    </p>
                  </div>
                </div>
              </div>

              {groupDescription && (
                <div className="group-info-description">
                  <p className="group-info-field-label">Descripción</p>
                  <p className="group-info-description-value">{groupDescription}</p>
                </div>
              )}

              <div className="group-settings-actions">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="group-settings-btn group-settings-btn-primary"
                  >
                    Editar información
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    setReportError('')
                    try {
                      const hasPending = await hasPendingObjectReport({ usuarioIdReporta: authUser?.uid, objetoReportadoId: channel.id, nombreObjetoReportado: 'grupo de chat' })
                      if (hasPending) setReportError('Ya tienes un reporte pendiente para este grupo. Podrás volver a reportarlo cuando se resuelva.')
                    } catch {
                      // ignore
                    }
                    setIsReportModalOpen(true)
                  }}
                  disabled={loading}
                  className="group-settings-btn group-settings-btn-warning"
                >
                  Reportar grupo
                </button>
                
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openDeleteGroupModal}
                    className="group-settings-btn group-settings-btn-danger"
                  >
                    Eliminar grupo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(true)}
                  disabled={loading || isSoleAdmin}
                  className="group-settings-btn group-settings-btn-danger"
                >
                  {loading ? 'Abandonando...' : isSoleAdmin ? 'No puedes abandonar' : 'Abandonar grupo'}
                </button>


              </div>

              {isSoleAdmin && (
                <p className="group-settings-sole-admin-hint">
                  Debes dejar al menos un administrador en el grupo.
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="group-settings-form-field">
                <label className="group-settings-form-label">Nombre</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="group-settings-input"
                  maxLength={100}
                />
                {errors.name && <p className="group-settings-field-error">{errors.name}</p>}
              </div>

              <div className="group-settings-form-field">
                <label className="group-settings-form-label">Descripción</label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="group-settings-textarea"
                  maxLength={500}
                />
                {errors.description && <p className="group-settings-field-error">{errors.description}</p>}
              </div>

              <div className="group-settings-form-field">
                <label className="group-settings-form-label">Foto</label>
                <div className="group-settings-photo-buttons">
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="group-settings-btn group-settings-btn-danger"
                  >
                    Eliminar foto
                  </button>
                </div>
                <FileInput
                  id="group-settings-image"
                  accept={ALLOWED_IMAGE_TYPES.join(',')}
                  onFileChange={(file) => handleImageSelect({ target: { files: file ? [file] : [] } })}
                  disabled={loading || deletingGroup}
                  initialFileName={groupImageFileName}
                />
                {errors.image && <p className="group-settings-field-error">{errors.image}</p>}
                <div className="group-settings-photo-preview">
                  {groupImagePreview ? (
                    <img
                      src={groupImagePreview}
                      alt={groupName}
                      className="group-settings-photo-preview-img"
                    />
                  ) : (
                    <div className="group-settings-photo-preview-fallback">
                      {(groupName.trim()[0] || 'G').toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <div className="group-settings-form-actions">
                <button
                  type="button"
                  onClick={handleSaveGroupInfo}
                  disabled={loading}
                  className="group-settings-btn group-settings-btn-primary"
                >
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  disabled={loading}
                  className="group-settings-btn group-settings-btn-danger"
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
          <div>
            <h3 style={{ marginBottom: 12 }}>Miembros</h3>
            <ul className="group-settings-members-list">
              {members.map((memberId) => {
                const memberIsAdmin = admins.includes(memberId)
                const isCurrentUser = memberId === authUser?.uid
                const isMemberMenuOpen = openMemberMenuId === memberId

                return (
                  <li key={memberId} className="group-settings-member-item">
                    <div className="group-settings-member-info">
                      <p className="group-settings-member-name">
                        {isCurrentUser ? (
                          'Tú'
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenProfile(memberId)}
                            className="group-settings-member-profile-btn"
                          >
                            {memberNicks[memberId] || memberId}
                          </button>
                        )}
                      </p>
                      {memberIsAdmin && <p className="group-settings-member-role">Admin</p>}
                    </div>

                    {isAdmin && !isCurrentUser && (
                      <div className="group-settings-member-actions">
                        <button
                          type="button"
                          onClick={() => toggleMemberMenu(memberId)}
                          disabled={loading}
                          aria-label="Más opciones"
                          aria-expanded={isMemberMenuOpen}
                          className="group-settings-member-menu-btn"
                        >
                          ⋯
                        </button>

                        {isMemberMenuOpen && (
                          <div className="group-settings-member-dropdown">
                            {!memberIsAdmin && (
                              <button
                                type="button"
                                onClick={async () => {
                                  closeMemberMenu()
                                  await handleMakeAdmin(memberId)
                                }}
                                disabled={loading}
                                className="group-settings-member-dropdown-item"
                              >
                                Hacer admin
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                closeMemberMenu()
                                await handleRemoveMember(memberId)
                              }}
                              disabled={loading}
                              className="group-settings-member-dropdown-item danger"
                            >
                              Eliminar miembro
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {isAdmin && (
            <div>
              <button
                type="button"
                onClick={() => setShowAddMembersPanel((currentValue) => !currentValue)}
                disabled={loading || loadingFriends}
                className="group-settings-btn group-settings-btn-success group-settings-members-toggle-btn"
                style={{ marginBottom: 12 }}
              >
                {showAddMembersPanel ? 'Ocultar miembros' : 'Agregar miembros'}
              </button>

              {showAddMembersPanel ? (
                friends.length === 0 ? (
                  <p style={{ color: '#64748b', marginBottom: 16 }}>
                    {loadingFriends ? 'Cargando amigos...' : 'No hay amigos disponibles para agregar.'}
                  </p>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <ul className="group-settings-friends-list">
                      {friends.map((friend) => (
                        <li key={friend.uid} className="group-settings-friend-item">
                          <span className="group-settings-friend-nick">{friend.nick}</span>
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

                    {errors.members && <p className="group-settings-field-error" style={{ marginBottom: 12 }}>{errors.members}</p>}

                    <button
                      type="button"
                      onClick={handleAddMembers}
                      disabled={loading || selectedFriendsToAdd.length === 0}
                      className="group-settings-btn group-settings-btn-success"
                      style={{ width: '100%' }}
                    >
                      {loading ? 'Agregando...' : `Agregar ${selectedFriendsToAdd.length} miembro(s)`}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          )}

          {!isAdmin && (
            <button
              type="button"
              onClick={handleLeaveGroup}
              disabled={loading}
              className="group-settings-btn group-settings-btn-danger"
              style={{ width: '100%', marginTop: 16 }}
            >
              {loading ? 'Abandonando...' : 'Abandonar grupo'}
            </button>
          )}
        </div>
      )}

      {deleteModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteGroupModal}>
          <div ref={deleteDialogRef} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <p className="attention">ATENCIÓN</p>
              <h3>Eliminar grupo</h3>
            </header>
            <div className="modal-body">
              <p>Esta acción eliminará el grupo, sus mensajes y su información asociada.</p>
              {deleteError ? <p className="form-message error">{deleteError}</p> : null}
            </div>
            <footer className="modal-footer">
              <button type="button" className="secondary-button" onClick={closeDeleteGroupModal} disabled={deletingGroup}>Cancelar</button>
              <button type="button" className="danger-button" onClick={handleDeleteGroup} disabled={deletingGroup}>{deletingGroup ? 'Eliminando...' : 'Eliminar grupo'}</button>
            </footer>
          </div>
        </div>
      ) : null}

      {leaveModalOpen ? (
        <ConfirmModal
          title="Abandonar grupo"
          message="Vas a abandonar este grupo. Se borrará solo tu registro de chat en este grupo para que ya no lo veas en tu lista. Los demás usuarios seguirán dentro del grupo y el grupo no se eliminará."
          confirmLabel={loading ? 'Abandonando...' : 'Sí, abandonar'}
          onCancel={() => {
            if (!loading) {
              setLeaveModalOpen(false)
            }
          }}
          onConfirm={handleLeaveGroup}
        />
      ) : null}
    </div>
  )
}
