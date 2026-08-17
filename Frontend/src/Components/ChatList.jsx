import React, { useEffect, useMemo, useRef, useState } from 'react'
import { collection, collectionGroup, onSnapshot, query, where } from 'firebase/firestore'
import { useChatContext } from 'stream-chat-react'
import { db } from '../firebase/firebase'
import { enrichChannelWithFirestoreData } from '../firebase/stream'
import { getUserProfile } from '../firebase/user'

function UserTypeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Zm0 2c-4.418 0-8 2.239-8 5v2h16v-2c0-2.761-3.582-5-8-5Z" fill="currentColor" />
    </svg>
  )
}

function GroupTypeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM7.5 13c-3.038 0-5.5 1.79-5.5 4v2h11v-2c0-2.21-2.462-4-5.5-4Zm9 0c-.678 0-1.31.098-1.87.278 1.414.82 2.37 2.073 2.37 3.722v2h6v-2c0-2.21-2.462-4-5.5-4Z" fill="currentColor" />
    </svg>
  )
}

function UnreadMessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.7 4a.6.6 0 0 1-1-.46V16.2A2.5 2.5 0 0 1 4 13.5v-8Z" fill="currentColor" />
    </svg>
  )
}

function getChannelMemberCount(channel) {
  return Object.values(channel.state?.members || {}).filter((member) => member?.user?.id).length
}

function isGroupChannel(channel) {
  if (channel.data?.type === 'group') {
    return true
  }

  const stateMemberCount = getChannelMemberCount(channel)

  if (stateMemberCount > 2) {
    return true
  }

  if (Array.isArray(channel.data?.members)) {
    return channel.data.members.length > 2
  }

  return Boolean(channel.data?.groupName || channel.data?.groupImageUrl)
}

function getOtherMemberId(channel, currentUserId) {
  const members = Object.values(channel.state?.members || {})
  return members.find((member) => member?.user?.id && member.user.id !== currentUserId)?.user?.id || null
}

function getUnreadCount(channel) {
  if (typeof channel?.countUnread === 'function') {
    const countUnread = channel.countUnread()
    if (typeof countUnread === 'number') {
      return countUnread
    }
  }

  return typeof channel?.state?.unreadCount === 'number' ? channel.state.unreadCount : 0
}

//Obtengo el título del canal, ya sea por nombre, nombre de grupo o 
// por el nombre del otro miembro en caso de ser un chat directo.
function getChannelTitle(channel, currentUserId) {
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

function applyFirestoreChannelData(channel, firestoreData) {
  if (!channel) return channel

  const nextChannel = {
    ...channel,
    data: {
      ...(channel.data || {}),
      type: firestoreData.type || channel.data?.type || null,
      groupName: firestoreData.groupName || channel.data?.groupName || channel.data?.name || null,
      groupDescription: firestoreData.groupDescription || channel.data?.groupDescription || '',
      groupImageUrl: firestoreData.groupImageUrl || channel.data?.groupImageUrl || null,
      image: firestoreData.groupImageUrl || channel.data?.image || null,
      members: firestoreData.members || channel.data?.members || [],
      admins: firestoreData.admins || channel.data?.admins || [],
      createdBy: firestoreData.createdBy || channel.data?.createdBy,
    },
  }

  return nextChannel
}

function ChannelRow({ channel, onClick, currentUserId, isSelected }) {
  const groupChat = isGroupChannel(channel)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (groupChat) {
        setProfile(null)
        return
      }

      const otherMemberId = getOtherMemberId(channel, currentUserId)

      if (!otherMemberId) {
        setProfile(null)
        return
      }

      try {
        const userProfile = await getUserProfile(otherMemberId)
        if (!cancelled) {
          setProfile(userProfile)
        }
      } catch {
        if (!cancelled) {
          setProfile(null)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [channel, currentUserId, groupChat])

  const title = groupChat
    ? getChannelTitle(channel, currentUserId)
    : profile?.nick || profile?.nombre || getChannelTitle(channel, currentUserId)

  const avatarUrl = groupChat
    ? channel.data?.groupImageUrl || channel.data?.image || null
    : profile?.fotoPerfil || null

  const unreadCount = getUnreadCount(channel)

  return (
    <button
      type="button"
      className={`channel-preview${isSelected ? ' channel-preview-selected' : ''}`}
      onClick={() => onClick(channel)}
      aria-pressed={isSelected}
    >
      <div className="channel-preview-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={title} className="channel-preview-avatar-image" />
        ) : (
          <div className="channel-preview-avatar-fallback" aria-hidden="true">
            {groupChat ? <GroupTypeIcon /> : <UserTypeIcon />}
          </div>
        )}
      </div>

      <div className="channel-preview-content">
        <div className="channel-preview-title-row">
          <span className="channel-preview-type-icon" aria-hidden="true">
            {groupChat ? <GroupTypeIcon /> : <UserTypeIcon />}
          </span>
          <span className="channel-preview-title">{title}</span>
        </div>
      </div>

      {unreadCount > 0 ? (
        <span className="channel-preview-unread-icon" aria-label="Mensajes no leidos">
          <UnreadMessageIcon />
          <span className="channel-preview-unread-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        </span>
      ) : (
        <span className="channel-preview-unread-icon channel-preview-unread-icon-hidden" aria-hidden="true" />
      )}
    </button>
  )
}

export default function ChatList({ onSelectChannel, selectedChannel }) {
  const { client } = useChatContext()
  const [channels, setChannels] = useState([])
  const [blockedUserIds, setBlockedUserIds] = useState(() => new Set())
  const [blockedByUserIds, setBlockedByUserIds] = useState(() => new Set())
  const onSelectChannelRef = useRef(onSelectChannel)
  const selectedChannelIdRef = useRef(selectedChannel?.id || '')
  const selectedChannelRef = useRef(selectedChannel)

  useEffect(() => {
    onSelectChannelRef.current = onSelectChannel
  }, [onSelectChannel])

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id || ''
    selectedChannelRef.current = selectedChannel
  }, [selectedChannel])

  useEffect(() => {
    let cancelled = false

    //Agrego el canal seleccionado a la lista de canales si no está presente.
    async function addSelectedChannel() {
      if (!selectedChannel?.id) {
        return
      }

      setChannels((currentChannels) => {
        if (currentChannels.some((channel) => channel.id === selectedChannel.id)) {
          return currentChannels
        }

        return [selectedChannel, ...currentChannels]
      })

      try {
        const enrichedSelected = await enrichChannelWithFirestoreData(selectedChannel)
        if (cancelled) return

        setChannels((currentChannels) => {
          if (currentChannels.some((channel) => channel.id === enrichedSelected.id)) {
            return currentChannels.map((channel) => (channel.id === enrichedSelected.id ? enrichedSelected : channel))
          }

          return [enrichedSelected, ...currentChannels]
        })
      } catch (error) {
        console.error('Error al enriquecer el canal seleccionado:', error)
      }
    }

    void addSelectedChannel()

    return () => {
      cancelled = true
    }
  }, [selectedChannel])

  useEffect(() => {
    let mounted = true

    async function loadChannels() {
      if (!client || !client.userID) {
        setChannels([])
        return
      }

      try {
        const filters = { members: { $in: [client.userID] } }
        const sort = [{ last_message_at: -1 }]

        const results = await client.queryChannels(filters, sort, { limit: 50 })

        if (!mounted) return
        const enriched = await Promise.all(results.map((ch) => enrichChannelWithFirestoreData(ch)))
        setChannels((currentChannels) => {
          const mergedById = new Map(currentChannels.map((channel) => [channel.id, channel]))

          enriched.forEach((channel) => {
            mergedById.set(channel.id, channel)
          })

          const currentSelectedChannel = selectedChannelRef.current
          if (currentSelectedChannel?.id && !mergedById.has(currentSelectedChannel.id)) {
            mergedById.set(currentSelectedChannel.id, currentSelectedChannel)
          }

          return Array.from(mergedById.values())
        })
      } catch (error) {
        console.error('Error cargando canales:', error)
      }
    }

    loadChannels()

    return () => {
      mounted = false
    }
  }, [client])

  useEffect(() => {
    if (!client?.userID || !db) {
      return undefined
    }

    const channelsRef = collection(db, 'streamChannels')
    const userChannelsQuery = query(channelsRef, where('members', 'array-contains', client.userID))

    return onSnapshot(userChannelsQuery, (snapshot) => {
      const firestoreChannelsById = new Map(
        snapshot.docs.map((channelSnapshot) => [channelSnapshot.id, channelSnapshot.data()]),
      )
      const activeChannelIds = new Set(firestoreChannelsById.keys())

      setChannels((currentChannels) => {
        return currentChannels
          .filter((channel) => activeChannelIds.has(channel.id))
          .map((channel) => {
            const firestoreData = firestoreChannelsById.get(channel.id)

            if (!firestoreData) {
              return channel
            }

            return applyFirestoreChannelData(channel, firestoreData)
          })
      })
    })
  }, [client?.userID])

  useEffect(() => {
    if (!client?.userID || !db) {
      return undefined
    }

    const ownBlocksRef = collection(db, 'usuario', client.userID, 'UsuariosBloqueados')
    const incomingBlocksQuery = query(
      collectionGroup(db, 'UsuariosBloqueados'),
      where('UserID', '==', client.userID),
    )

    const unsubscribeOwnBlocks = onSnapshot(ownBlocksRef, (snapshot) => {
      setBlockedUserIds(new Set(snapshot.docs.map((blockedDocument) => blockedDocument.id)))
    })

    const unsubscribeIncomingBlocks = onSnapshot(incomingBlocksQuery, (snapshot) => {
      setBlockedByUserIds(new Set(
        snapshot.docs
          .map((blockedDocument) => blockedDocument.ref.parent.parent?.id || '')
          .filter(Boolean),
      ))
    })

    return () => {
      unsubscribeOwnBlocks()
      unsubscribeIncomingBlocks()
    }
  }, [client?.userID])

  const visibleChannels = useMemo(() => channels.filter((channel) => {
      if (isGroupChannel(channel)) {
        return true
      }

      const otherMemberId = getOtherMemberId(channel, client?.userID)

      return !otherMemberId || (
        !blockedUserIds.has(otherMemberId) &&
        !blockedByUserIds.has(otherMemberId)
      )
    }), [blockedByUserIds, blockedUserIds, channels, client?.userID])

  useEffect(() => {
    const selectedChannelId = selectedChannelIdRef.current

    if (!selectedChannelId) {
      return
    }

    const channelStillVisible = visibleChannels.some((channel) => channel.id === selectedChannelId)

    if (!channelStillVisible) {
      onSelectChannelRef.current?.(null)
    }
  }, [visibleChannels])

  if (visibleChannels.length === 0) {
    return (
      <div>
        <p className="status-message">No tienes chats creados</p>
      </div>
    )
  }

  return (
    <div>
      {visibleChannels.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          onClick={onSelectChannel}
          currentUserId={client?.userID}
          isSelected={selectedChannel?.id === channel.id}
        />
      ))}
    </div>
  )
}
