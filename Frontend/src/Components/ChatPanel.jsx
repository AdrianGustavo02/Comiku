import { useEffect, useState } from 'react'
import { Chat } from 'stream-chat-react'
import 'stream-chat-react/dist/css/v2/index.css'
import '../styles/ChatPanel.css'
import { getStreamToken, initStreamClient, getStreamClient } from '../firebase/stream'
import ChatList from './ChatList'
import ChatView from './ChatView'

export default function ChatPanel({ authUser, selectedChannel: externalSelectedChannel, onSelectChannel, onClientReady, onClientError, onOpenProfile }) {
  const [clientReady, setClientReady] = useState(false)
  const [internalSelectedChannel, setInternalSelectedChannel] = useState(null)
  const [channelsExist, setChannelsExist] = useState(null)

  const selectedChannel = typeof externalSelectedChannel === 'undefined'
    ? internalSelectedChannel
    : externalSelectedChannel

  const handleSelectChannel = (channel) => {
    if (onSelectChannel) {
      onSelectChannel(channel)
      return
    }

    setInternalSelectedChannel(channel)
  }

  useEffect(() => {
    let mounted = true

    async function init() {
      if (!authUser?.uid) return

      //Conexion con StreamChat.
      try {
        if (onClientReady) {
          onClientReady(false)
        }

        const payload = await getStreamToken()
        const { apiKey, token } = payload

        const user = { id: authUser.uid, name: authUser.nick || authUser.uid }
        const c = await initStreamClient({ apiKey, token, user })

        if (!mounted) return
        void c
        setClientReady(true)
        if (onClientReady) {
          onClientReady(true)
        }
      } catch (error) {
        if (onClientReady) {
          onClientReady(false)
        }
        if (onClientError) {
          const errMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error))
          onClientError(errMsg)
        }
      }
    }

    init()

    return () => {
      mounted = false
      if (onClientReady) {
        onClientReady(false)
      }
      const c = getStreamClient()
      if (c) {
        try {
          c.disconnectUser()
        } catch {
        }
      }
    }
  }, [authUser?.uid, authUser?.nick])

  useEffect(() => {
    let mounted = true

    //Chequeo si el usuario tiene canales de chats, 
    // para mostrar un mensaje si no tiene ninguno o cargar el listado si tiene.
    async function checkChannels() {
      const c = getStreamClient()
      if (!c || !c.userID) {
        if (mounted) setChannelsExist(false)
        return
      }

      try {
        const filters = { members: { $in: [c.userID] } }
        const sort = [{ last_message_at: -1 }]
        const results = await c.queryChannels(filters, sort, { limit: 1 })
        if (!mounted) return
        setChannelsExist((results || []).length > 0)
      } catch (err) {
        if (mounted) setChannelsExist(false)
      }
    }

    if (clientReady) void checkChannels()

    return () => { mounted = false }
  }, [clientReady])

  useEffect(() => {
    if (selectedChannel?.id) {
      setChannelsExist(true)
    }
  }, [selectedChannel?.id])

  if (!clientReady) {
    return <div className="chat-panel-loading">Cargando chat...</div>
  }

  if (channelsExist === null) {
    return <div className="chat-panel-loading">Cargando chat...</div>
  }

  if (channelsExist === false) {
    return (
      <div>
        <p className="chat-panel-loading">No tienes chats creados</p>
      </div>
    )
  }

  const c = getStreamClient()

  if (!c) {
    return <div className="chat-panel-loading">Cargando chat...</div>
  }

  return (
    <div className="chat-panel">
      <Chat client={c} theme="messaging light">
        <div className="chat-panel-left">
          <ChatList onSelectChannel={handleSelectChannel} selectedChannel={selectedChannel} />
        </div>

        <div className="chat-panel-right">
          <ChatView
            key={selectedChannel?.id || 'no-selected-channel'}
            channel={selectedChannel}
            authUser={authUser}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </Chat>
    </div>
  )
}
