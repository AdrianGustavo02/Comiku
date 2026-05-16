import React, { useEffect, useState, useCallback } from 'react'
import { Channel, Window, ChannelHeader, MessageList, Thread } from 'stream-chat-react'
import AudioRecorderInput from './AudioRecorderInput'
import GroupSettings from './GroupSettings'
import { enrichChannelWithFirestoreData } from '../firebase/stream'

function GroupHeader({ groupImage, groupTitle, membersCount }) {
  const groupInitial = (groupTitle.trim()[0] || 'G').toUpperCase()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#e2e8f0',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0f172a',
          fontWeight: 700,
          fontSize: 18,
        }}
      >
        {groupImage ? (
          <img
            src={groupImage}
            alt={groupTitle}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          groupInitial
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {groupTitle}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {membersCount || 0} miembros
        </div>
      </div>
    </div>
  )
}

export default function ChatView({ channel, authUser }) {
  const [activeChannel, setActiveChannel] = useState(channel)
  const [enrichedChannel, setEnrichedChannel] = useState(channel)
  const [showGroupSettings, setShowGroupSettings] = useState(false)

  const refreshChannelData = useCallback(async (currentChannel) => {
    if (!currentChannel) return

    const refreshedChannel = await enrichChannelWithFirestoreData(currentChannel)
    const channelClone = Object.assign(
      Object.create(Object.getPrototypeOf(refreshedChannel)),
      refreshedChannel,
    )

    setActiveChannel(channelClone)
    setEnrichedChannel(channelClone)
  }, [])

  useEffect(() => {
    if (!channel) return

    Promise.resolve().then(() => setActiveChannel(channel))
    // Enrich channel with Firestore data (deferred)
    const t = setTimeout(() => void refreshChannelData(channel), 0)
    return () => clearTimeout(t)
  }, [channel, refreshChannelData])

  if (!activeChannel) {
    return <div className="chat-view-empty">Selecciona un chat para empezar</div>
  }

  const isGroupChat = activeChannel?.data?.members?.length > 2
  const groupTitle = enrichedChannel?.data?.groupName || enrichedChannel?.data?.name || activeChannel?.data?.name || 'Grupo'
  const groupImage = enrichedChannel?.data?.groupImageUrl || enrichedChannel?.data?.image || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showGroupSettings && isGroupChat ? (
        <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #e6e6e6' }}>
          <GroupSettings
            channel={enrichedChannel}
            authUser={authUser}
            onClose={() => setShowGroupSettings(false)}
            onUpdated={() => refreshChannelData(enrichedChannel)}
          />
        </div>
      ) : (
        <Channel channel={activeChannel} doConnect={false}>
          <Window>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e6e6e6' }}>
              {isGroupChat ? <GroupHeader groupImage={groupImage} groupTitle={groupTitle} membersCount={activeChannel?.data?.members?.length} /> : <ChannelHeader />}
              {isGroupChat && (
                <button
                  type="button"
                  onClick={() => setShowGroupSettings(true)}
                  style={{
                    padding: '8px 12px',
                    background: '#0f172a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  ⚙️ Grupo
                </button>
              )}
            </div>
            <MessageList />
            <AudioRecorderInput channel={activeChannel} />
          </Window>
          <Thread />
        </Channel>
      )}
    </div>
  )
}
