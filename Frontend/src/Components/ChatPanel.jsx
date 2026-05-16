import { useEffect, useState } from 'react'
import { Chat } from 'stream-chat-react'
import 'stream-chat-react/dist/css/v2/index.css'
import './Chat.css'
import { getStreamToken, initStreamClient, getStreamClient } from '../firebase/stream'
import ChatList from './ChatList'
import ChatView from './ChatView'

export default function ChatPanel({ authUser, selectedChannel: externalSelectedChannel, onSelectChannel, onClientReady, onClientError }) {
  const [clientReady, setClientReady] = useState(false)
  const [internalSelectedChannel, setInternalSelectedChannel] = useState(null)

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
        console.error('Error inicializando Stream:', error)
        if (onClientReady) {
          onClientReady(false)
        }
        if (onClientError) {
          onClientError(error instanceof Error ? error.message : 'No fue posible inicializar el chat.')
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
          // ignore
        }
      }
    }
  }, [authUser?.uid, authUser?.nick, onClientReady, onClientError])

  if (!clientReady) {
    return <div className="chat-panel-loading">Cargando chat...</div>
  }

  const c = getStreamClient()

  return (
    <div className="chat-panel">
      <Chat client={c} theme="messaging light">
        <div className="chat-panel-left">
          <ChatList onSelectChannel={handleSelectChannel} />
        </div>

        <div className="chat-panel-right">
          <ChatView channel={selectedChannel} authUser={authUser} />
        </div>
      </Chat>
    </div>
  )
}
