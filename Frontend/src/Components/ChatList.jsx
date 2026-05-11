import React, { useEffect, useState } from 'react'
import { useChatContext } from 'stream-chat-react'
import { enrichChannelWithFirestoreData } from '../firebase/stream'

function getChannelTitle(channel, currentUserId) {
  // Prefer explicit Stream `name`, then Firestore-enriched `groupName`, then fallbacks
  if (channel.data?.name) {
    return channel.data.name
  }

  if (channel.data?.groupName) {
    return channel.data.groupName
  }

  if (channel.data?.group_name) {
    return channel.data.group_name
  }

  const members = Object.values(channel.state?.members || {})
  const otherMember = members.find((member) => member?.user?.id !== currentUserId)

  if (otherMember?.user?.name) {
    return otherMember.user.name
  }

  if (otherMember?.user?.id) {
    return otherMember.user.id
  }

  return (channel.id || '').replace(/^dm-/, '')
}

function ChannelRow({ channel, onClick, currentUserId }) {
  const title = getChannelTitle(channel, currentUserId)

  return (
    <div className="channel-preview" onClick={() => onClick(channel)}>
      <div className="channel-preview-title">{title}</div>
      <div className="channel-preview-sub">{channel.state?.last_message_at ? new Date(channel.state.last_message_at).toLocaleString() : ''}</div>
    </div>
  )
}

export default function ChatList({ onSelectChannel }) {
  const { client } = useChatContext()
  const [channels, setChannels] = useState([])

  useEffect(() => {
    let mounted = true

    async function loadChannels() {
      if (!client || !client.userID) return

      try {
        const filters = { members: { $in: [client.userID] } }
        const sort = [{ last_message_at: -1 }]

        const results = await client.queryChannels(filters, sort, { limit: 50 })

            if (!mounted) return
            // Enrich channels with Firestore metadata (groupName, image, etc.)
            const enriched = await Promise.all(results.map((ch) => enrichChannelWithFirestoreData(ch)))
            setChannels(enriched)
      } catch (error) {
        console.error('Error cargando canales:', error)
      }
    }

    loadChannels()

    return () => {
      mounted = false
    }
  }, [client])

  return (
    <div>
      {channels.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          onClick={onSelectChannel}
          currentUserId={client?.userID}
        />
      ))}
    </div>
  )
}
