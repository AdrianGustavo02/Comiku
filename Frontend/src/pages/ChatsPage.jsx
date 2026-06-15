import { useEffect, useMemo, useState, useCallback } from 'react'
import ChatPanel from '../Components/ChatPanel'
import { createGroupChannel, createOrGet1to1Channel } from '../firebase/stream'
import { getAllUsers, getUserFriends, isUserBlocked } from '../firebase/user'
import { ALLOWED_IMAGE_TYPES, MAX_COVER_SIZE_BYTES, createCompressedImageDataUrl, readFileAsDataUrl } from '../constants/imageUpload'
import '../styles/ChatsPage.css'
import FileInput from '../Components/FileInput'
import Button from '../Components/Button'

function normalizeText(value) {
  return (value || '').toLowerCase().trim()
}

function ChatsPage({ authUser, onOpenProfile, onOpenFriends, onPageReady }) {
  const [users, setUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [error, setError] = useState('')
  const [blockedByMeMap, setBlockedByMeMap] = useState({})
  const [showFriendsList, setShowFriendsList] = useState(false)
  const [creatingChatForUid, setCreatingChatForUid] = useState('')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [isChatReady, setIsChatReady] = useState(false)
  const [pendingFriendUid, setPendingFriendUid] = useState('')
  const [showGroupFriendsList, setShowGroupFriendsList] = useState(false)
  const [selectedGroupFriendUids, setSelectedGroupFriendUids] = useState([])
  const [creatingGroupChat, setCreatingGroupChat] = useState(false)
  const [showGroupFormStep, setShowGroupFormStep] = useState(false)
  const [groupFormData, setGroupFormData] = useState({ name: '', description: '', imageUrl: null, imagePreview: null })
  const [groupFormErrors, setGroupFormErrors] = useState({})
  const [groupImageFileName, setGroupImageFileName] = useState('')

  useEffect(() => {
    if (!pendingFriendUid || isChatReady) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPendingFriendUid('')
      setCreatingChatForUid('')
      setError('No se pudo inicializar el chat a tiempo. Vuelve a intentarlo.')
    }, 12000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pendingFriendUid, isChatReady])

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      try {
        setLoading(true)
        const all = await getAllUsers()
        if (!cancelled) setUsers(all)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No fue posible cargar usuarios')
      } finally {
        if (!cancelled) {
          setLoading(false)
          if (typeof onPageReady === 'function') onPageReady()
        }
      }
    }

    loadUsers()

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedQuery = normalizeText(query)

  const results = useMemo(() => {
    if (!normalizedQuery) return []
    return users.filter((u) => normalizeText(u.nick).includes(normalizedQuery))
  }, [users, normalizedQuery])
  
  const visibleResults = useMemo(() => results, [results])

  useEffect(() => {
    let cancelled = false

    async function loadBlockedStatuses() {
      if (!authUser?.uid || visibleResults.length === 0) {
        setBlockedByMeMap({})
        return
      }

      const entries = await Promise.all(
        visibleResults.map(async (user) => {
          try {
            const blockedByMe = await isUserBlocked(user.uid, authUser.uid)
            return [user.uid, blockedByMe]
          } catch {
            return [user.uid, false]
          }
        })
      )

      if (!cancelled) {
        setBlockedByMeMap(Object.fromEntries(entries))
      }
    }

    loadBlockedStatuses()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, visibleResults])

  async function loadFriendsForChat() {
    if (!authUser?.uid) {
      setError('No hay un usuario autenticado para iniciar conversaciones.')
      return []
    }

    try {
      setLoadingFriends(true)
      setError('')
      const friendsList = await getUserFriends(authUser.uid)
      setFriends(friendsList)
      return friendsList
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar tus amigos.')
      return []
    } finally {
      setLoadingFriends(false)
    }
  }

  async function handleStartConversationClick() {
    const friendsList = await loadFriendsForChat()
    setShowFriendsList(true)
    setShowGroupFriendsList(false)
    setSelectedGroupFriendUids([])
    if (friendsList.length === 0) {
      setShowFriendsList(true)
    }
  }

  async function handleStartGroupConversationClick() {
    const friendsList = await loadFriendsForChat()
    setShowGroupFriendsList(true)
    setShowFriendsList(false)
    setSelectedGroupFriendUids([])
    if (friendsList.length === 0) {
      setShowGroupFriendsList(true)
    }
  }

  const handleStartChatWithFriend = useCallback(async (friendUid, options = {}) => {
    const { skipReadyCheck = false } = options

    if (!authUser?.uid || !friendUid) {
      setError('No fue posible iniciar la conversación.')
      return
    }

    if (!skipReadyCheck && !isChatReady) {
      setPendingFriendUid(friendUid)
      setCreatingChatForUid(friendUid)
      setError('Inicializando chat... se abrira automaticamente en unos segundos.')
      return
    }

    try {
      setCreatingChatForUid(friendUid)
      setError('')
      const channel = await createOrGet1to1Channel({ members: [authUser.uid, friendUid] })
      setSelectedChannel(channel)
      setShowFriendsList(false)
      setPendingFriendUid('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la conversación.')
      setPendingFriendUid('')
    } finally {
      setCreatingChatForUid('')
    }
  }, [authUser?.uid, isChatReady])

  useEffect(() => {
    if (!isChatReady || !pendingFriendUid) {
      return
    }

    void handleStartChatWithFriend(pendingFriendUid, { skipReadyCheck: true })
  }, [isChatReady, pendingFriendUid, handleStartChatWithFriend])

  

  function handleToggleGroupFriend(friendUid) {
    setSelectedGroupFriendUids((prev) => {
      if (prev.includes(friendUid)) {
        return prev.filter((uid) => uid !== friendUid)
      }

      return [...prev, friendUid]
    })
  }

  function handleGroupFormNextStep() {
    setShowGroupFormStep(true)
    setGroupFormData({ name: '', description: '', imageUrl: null, imagePreview: null })
    setGroupFormErrors({})
    setGroupImageFileName('')
  }

  async function handleGroupImageSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setGroupFormErrors({ ...groupFormErrors, image: 'Formato de imagen no soportado. Usa JPG, PNG o WEBP.' })
      return
    }

    if (file.size > MAX_COVER_SIZE_BYTES) {
      setGroupFormErrors({ ...groupFormErrors, image: `Tamaño máximo 500KB. Tu archivo pesa ${Math.round(file.size / 1024)}KB.` })
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const compressedDataUrl = await createCompressedImageDataUrl(dataUrl)
      setGroupFormData((prev) => ({
        ...prev,
        imageUrl: compressedDataUrl,
        imagePreview: dataUrl,
      }))
      setGroupImageFileName(file.name || '')
      setGroupFormErrors({ ...groupFormErrors, image: null })
    } catch {
      setGroupFormErrors({ ...groupFormErrors, image: 'No se pudo leer la imagen.' })
    }
  }

  async function handleCreateGroupChat() {
    if (!authUser?.uid) {
      setError('No hay un usuario autenticado para iniciar conversaciones.')
      return
    }

    if (!isChatReady) {
      setError('El chat aun no esta listo. Espera unos segundos e intentalo de nuevo.')
      return
    }

    if (selectedGroupFriendUids.length < 2) {
      setError('Selecciona al menos 2 amigos para iniciar un chat grupal.')
      return
    }

    // Validate form data
    const errors = {}
    if (!groupFormData.name.trim()) {
      errors.name = 'El nombre del grupo es obligatorio.'
    } else if (groupFormData.name.trim().length > 100) {
      errors.name = 'El nombre debe tener máximo 100 caracteres.'
    }

    if (groupFormData.description && groupFormData.description.length > 500) {
      errors.description = 'La descripción debe tener máximo 500 caracteres.'
    }

    if (Object.keys(errors).length > 0) {
      setGroupFormErrors(errors)
      return
    }

    try {
      setCreatingGroupChat(true)
      setError('')

      const channel = await createGroupChannel({
        name: groupFormData.name.trim(),
        members: [authUser.uid, ...selectedGroupFriendUids],
        metadata: {},
        description: groupFormData.description?.trim() || null,
        imageUrl: groupFormData.imageUrl || null,
      })

      setSelectedChannel(channel)
      setShowGroupFriendsList(false)
      setShowGroupFormStep(false)
      setSelectedGroupFriendUids([])
      setGroupFormData({ name: '', description: '', imageUrl: null, imagePreview: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el chat grupal.')
    } finally {
      setCreatingGroupChat(false)
    }
  }

  return (
    <main className="app-shell chats-page-shell">
      <section className="app-card user-list-page">
        <header>
          <h1>Chats</h1>
          <p className="">Los chats no cuentan con cifrado de extremo a extremo. Un administrador puede revisar los mensajes.</p>
        </header>

        <div className="chats-toolbar" style={{ marginBottom: 12 }}>
          <Button
            variant="primary"
            className="delete-account-button"
            type="button"
            onClick={handleStartConversationClick}
            disabled={loadingFriends}
            style={{ marginRight: 8 }}
          >
            {loadingFriends ? 'Cargando amigos...' : 'Iniciar conversacion'}
          </Button>
          <Button
            variant="secondary"
            className="profile-back-button"
            type="button"
            onClick={handleStartGroupConversationClick}
            disabled={loadingFriends}
            style={{ marginRight: 8 }}
          >
            Iniciar chat grupal
          </Button>
          <Button
            variant="secondary"
            className="profile-back-button"
            type="button"
            onClick={onOpenFriends}
            style={{ marginRight: 8 }}
          >
            Amigos
          </Button>
        </div>

        {error ? <p className="form-message error">{error}</p> : null}

        {showFriendsList ? (
          <section className="chat-start-card">
            <h2>Selecciona un amigo para iniciar el chat</h2>

            {friends.length === 0 ? (
              <p className="status-message-black">Todavia no tienes amigos. Agrega amigos para iniciar una conversacion.</p>
            ) : (
              <ul className="search-suggestion-list" role="listbox">
                {friends.map((friend) => (
                  <li key={friend.uid}>
                    <button
                      type="button"
                      className="search-suggestion-button"
                      onClick={() => handleStartChatWithFriend(friend.uid)}
                      disabled={creatingChatForUid === friend.uid}
                      style={{ display: 'flex', alignItems: 'center' }}
                    >
                      <img src={friend.fotoPerfil} alt={`Foto de ${friend.nick}`} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12 }} />
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                        <strong>{friend.nick}</strong>
                        {creatingChatForUid === friend.uid ? (
                          <span style={{ fontSize: 12, opacity: 0.8 }}>Iniciando conversacion...</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {showGroupFriendsList && !showGroupFormStep ? (
          <section className="chat-start-card">
            <h2>Selecciona amigos para iniciar chat grupal</h2>

            {friends.length === 0 ? (
              <p className="status-message-black">Todavia no tienes amigos. Agrega amigos para iniciar un chat grupal.</p>
            ) : (
              <>
                <ul
                  className="search-suggestion-list"
                  role="listbox"
                  aria-multiselectable="true"
                  style={{ maxHeight: 320, overflowY: 'auto', marginTop: 0 }}
                >
                  {friends.map((friend) => {
                    const checked = selectedGroupFriendUids.includes(friend.uid)

                    return (
                      <li key={friend.uid}>
                        <label
                          className="search-suggestion-button"
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center' }}>
                            <img src={friend.fotoPerfil} alt={`Foto de ${friend.nick}`} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12 }} />
                            <strong>{friend.nick}</strong>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleGroupFriend(friend.uid)}
                          />
                        </label>
                      </li>
                    )
                  })}
                </ul>

                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Button
                    variant="primary"
                    className="delete-account-button"
                    type="button"
                    onClick={handleGroupFormNextStep}
                    disabled={selectedGroupFriendUids.length < 2 || creatingGroupChat}
                  >
                    {selectedGroupFriendUids.length < 2 ? 'Selecciona al menos 2 amigos' : 'Continuar'}
                  </Button>

                  <Button
                    variant="secondary"
                    className="profile-back-button"
                    type="button"
                    onClick={() => {
                      setShowGroupFriendsList(false)
                      setSelectedGroupFriendUids([])
                    }}
                    disabled={creatingGroupChat}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {showGroupFormStep ? (
          <section className="chat-start-card">
            <h2>Configurar grupo ({selectedGroupFriendUids.length + 1} miembros)</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Nombre del grupo</label>
              <input
                type="text"
                placeholder="Ej: Fans del manga"
                value={groupFormData.name}
                onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid #d7d7d7', borderRadius: 10 }}
                maxLength={100}
              />
              {groupFormErrors.name && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{groupFormErrors.name}</p>}
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{groupFormData.name.length}/100 caracteres</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Descripción (opcional)</label>
              <textarea
                placeholder="Ej: Grupo para fans de mangas clásicos"
                value={groupFormData.description}
                onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid #d7d7d7', borderRadius: 10, fontFamily: 'inherit', resize: 'vertical', minHeight: 80 }}
                maxLength={500}
              />
              {groupFormErrors.description && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{groupFormErrors.description}</p>}
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{groupFormData.description.length}/500 caracteres</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Foto del grupo (opcional)</label>
              <FileInput
                id="group-image-input"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                onFileChange={(file) => handleGroupImageSelect({ target: { files: file ? [file] : [] } })}
                disabled={creatingGroupChat}
                initialFileName={groupImageFileName}
              />
              {groupFormData.imagePreview && (
                <div style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
                  <img src={groupFormData.imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              {groupFormErrors.image && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{groupFormErrors.image}</p>}
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                className="delete-account-button"
                type="button"
                onClick={handleCreateGroupChat}
                disabled={creatingGroupChat}
              >
                {creatingGroupChat ? 'Creando grupo...' : 'Crear grupo'}
              </Button>

              <Button
                variant="secondary"
                className="profile-back-button"
                type="button"
                onClick={() => {
                  setShowGroupFormStep(false)
                  setGroupFormData({ name: '', description: '', imageUrl: null, imagePreview: null })
                  setGroupFormErrors({})
                  setGroupImageFileName('')
                }}
                disabled={creatingGroupChat}
              >
                Atrás
              </Button>
            </div>
          </section>
        ) : null}

        <div className="thematic-search-bar chats-search-bar" style={{ margin: '12px 0 0', gap: 4 }}>
          <label className="thematic-search-label" htmlFor="chat-user-search">Busca usuarios por su nick para ver su perfil.</label>
          <input
            id="chat-user-search"
            className="thematic-search-input"
            type="search"
            placeholder="Introduce un nick..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {normalizedQuery ? (
          loading ? (
            <p className="status-message-black">Cargando usuarios...</p>
          ) : (
            <div>
              {results.length === 0 ? (
                <p className="status-message-black">No se encontraron coincidencias con ese nick.</p>
              ) : null}

              {results.length > 0 && (
                <ul className="search-suggestion-list" role="listbox" style={{ marginTop: 0, maxHeight: 300, overflowY: 'auto' }}>
                  {visibleResults.map((u) => (
                    <li key={u.uid}>
                      <button
                        type="button"
                        className="search-suggestion-button"
                        onClick={() => {
                          if (blockedByMeMap[u.uid]) {
                            return
                          }

                          onOpenProfile(u.uid)
                        }}
                        disabled={Boolean(blockedByMeMap[u.uid])}
                      >
                        <img src={u.fotoPerfil} alt={`Foto de ${u.nick}`} style={{width:40,height:40,borderRadius:'50%',objectFit:'cover',marginRight:12}} />
                        <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',lineHeight:1.2}}>
                          <strong>{u.nick}</strong>
                          {blockedByMeMap[u.uid] ? (
                            <span className="chat-search-blocked-help">Desbloquea a este usuario para acceder a su perfil</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

            </div>
          )
        ) : null}

        <div className="chat-panel-wrapper" style={{ marginTop: 18 }}>
          <ChatPanel
            authUser={authUser}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
            onClientReady={setIsChatReady}
            onClientError={(message) => {
              setPendingFriendUid('')
              setCreatingChatForUid('')
              setError(`Error al conectar chat: ${message}`)
            }}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </section>
    </main>
  )
}

export default ChatsPage
