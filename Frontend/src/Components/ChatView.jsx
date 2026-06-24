import React, { useEffect, useState, useCallback } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Channel, Window, MessageList, Thread } from 'stream-chat-react'
import AudioRecorderInput from './AudioRecorderInput'
import GroupSettings from './GroupSettings'
import MessageTimestampInjector from './MessageTimestampInjector'
import { enrichChannelWithFirestoreData, getStreamClient } from '../firebase/stream'
import { db } from '../firebase/firebase'
import defaultProfilePicture from '../assets/defaultProfilePicture.png'
import '../styles/ChatView.css'

//Verifico si el canal es una instancia de StreamChat.
function isStreamChannelInstance(channel) {
  return Boolean(channel && typeof channel.getConfig === 'function')
}

//Obtengo el ID del otro miembro en un chat individual.
function getOtherMemberId(channel, currentUserId) {
  const members = Object.values(channel?.state?.members || {})
  return members.find((member) => member?.user?.id && member.user.id !== currentUserId)?.user?.id || null
}

//Aplico los datos de Firestore al canal, sobrescribiendo los datos existentes si es necesario.
function applyFirestoreDataToChannel(channel, firestoreData) {
  if (!channel) return channel

  if (channel.data) {
    Object.assign(channel.data, {
      type: firestoreData.type || channel.data.type || null,
      groupName: firestoreData.groupName || channel.data.groupName || channel.data.name || null,
      groupDescription: firestoreData.groupDescription || channel.data.groupDescription || '',
      groupImageUrl: firestoreData.groupImageUrl || channel.data.groupImageUrl || null,
      image: firestoreData.groupImageUrl || channel.data.image || null,
      members: firestoreData.members || channel.data.members || [],
      admins: firestoreData.admins || channel.data.admins || [],
      createdBy: firestoreData.createdBy || channel.data.createdBy,
    })
  }

  return {
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
}

//Determino si un canal es un chat grupal basado en los datos del canal.
function isGroupChannel(channel) {
  return Boolean(channel?.data?.type === 'group' || channel?.data?.groupName || channel?.data?.groupImageUrl)
}

//Renderizo el encabezado de un chat grupal con la imagen del grupo, el nombre y la cantidad de miembros.
function GroupHeader({ groupImage, groupTitle, membersCount }) {
  const groupInitial = (groupTitle.trim()[0] || 'G').toUpperCase()

  return (
    <div className="chat-view-user-summary">
      <div className="chat-view-group-avatar">
        {groupImage ? (
          <img
            src={groupImage}
            alt={groupTitle}
            className="chat-view-avatar-image"
          />
        ) : (
          groupInitial
        )}
      </div>

      <div className="chat-view-user-info">
        <div className="chat-view-user-title">
          {groupTitle}
        </div>
        <div className="chat-view-user-subtitle">
          {membersCount || 0} miembros
        </div>
      </div>
    </div>
  )
}

function PersonalHeader({ channel, currentUserId }) {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!channel?.id || !currentUserId || !db) {
      setProfile(null)
      return undefined
    }

    const otherMemberId = getOtherMemberId(channel, currentUserId)

    if (!otherMemberId) {
      setProfile(null)
      return undefined
    }

    const userRef = doc(db, 'usuario', otherMemberId)

    //Sincronizo cambios en el perfil del otro miembro en tiempo real.
    return onSnapshot(userRef, (snapshot) => {
      if (!snapshot.exists()) {
        setProfile(null)
        return
      }

      const data = snapshot.data()
      const fotoPerfil = data.FotoPerfil && typeof data.FotoPerfil === 'object' && data.FotoPerfil.dataUrl
        ? data.FotoPerfil.dataUrl
        : defaultProfilePicture

      setProfile({
        uid: otherMemberId,
        nick: data.Nick || otherMemberId,
        fotoPerfil,
      })
    })
  }, [channel?.id, currentUserId])

  const title = profile?.nick || 'Chat'
  const avatar = profile?.fotoPerfil || defaultProfilePicture

  return (
    <div className="chat-view-user-summary">
      <div className="chat-view-person-avatar">
        <img src={avatar} alt={title} className="chat-view-avatar-image" />
      </div>

      <div className="chat-view-user-info">
        <div className="chat-view-user-title">
          {title}
        </div>
        <div className="chat-view-user-subtitle">Chat individual</div>
      </div>
    </div>
  )
}

export default function ChatView({ channel, authUser, onOpenProfile }) {
  const [activeChannel, setActiveChannel] = useState(null)
  const [enrichedChannel, setEnrichedChannel] = useState(channel)
  const [showGroupSettings, setShowGroupSettings] = useState(false)

  const refreshChannelData = useCallback(async (currentChannel) => {
    if (!currentChannel) return

    const refreshedChannel = await enrichChannelWithFirestoreData(currentChannel)
    const enrichedCopy = applyFirestoreDataToChannel(refreshedChannel, refreshedChannel.data || {})

    setEnrichedChannel(enrichedCopy)
  }, [])

  useEffect(() => {
    if (!channel) {
      setActiveChannel(null)
      setEnrichedChannel(null)
      setShowGroupSettings(false)
      return undefined
    }

    let cancelled = false

    setEnrichedChannel(channel)
    setShowGroupSettings(false)
    setActiveChannel(null)

    //Convierto el canal a una instancia de StreamChat para poder usarlo.
    async function resolveChannelInstance() {
      if (isStreamChannelInstance(channel)) {
        if (!cancelled) {
          setActiveChannel(channel)
        }
        return
      }

      const client = getStreamClient()
      if (!client || !channel?.id) {
        return
      }

      const rebuiltChannel = client.channel(channel.type || 'messaging', channel.id, channel.data || {})

      try {
        await rebuiltChannel.watch()
      } catch {
      }

      if (!cancelled) {
        setActiveChannel(rebuiltChannel)
      }
    }

    void resolveChannelInstance()

    const t = setTimeout(() => void refreshChannelData(channel), 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [channel, refreshChannelData])

  //Sincronizo cambios en el canal seleccionado en tiempo real.
  useEffect(() => {
    if (!activeChannel?.id || !db) {
      return undefined
    }

    const channelRef = doc(db, 'streamChannels', activeChannel.id)

    return onSnapshot(channelRef, (snapshot) => {
      if (!snapshot.exists()) {
        return
      }

      const firestoreData = snapshot.data()
      const updatedChannel = applyFirestoreDataToChannel(activeChannel, firestoreData)

      setEnrichedChannel(updatedChannel)
    })
  }, [activeChannel?.id, db])

  if (!activeChannel) {
    return <div className="chat-view-empty">Selecciona un chat para empezar</div>
  }

  if (!isStreamChannelInstance(activeChannel)) {
    return <div className="chat-view-empty">Cargando chat...</div>
  }

  const isGroupChat = isGroupChannel(enrichedChannel || activeChannel)
  const groupTitle = enrichedChannel?.data?.groupName || enrichedChannel?.data?.name || activeChannel?.data?.name || 'Grupo'
  const groupImage = enrichedChannel?.data?.groupImageUrl || enrichedChannel?.data?.image || null

  return (
    <div className="chat-view-container">
          {showGroupSettings && isGroupChat ? (
        <div className="chat-view-group-settings-panel">
          <GroupSettings
            channel={enrichedChannel}
            authUser={authUser}
            onClose={() => setShowGroupSettings(false)}
                onUpdated={() => refreshChannelData(enrichedChannel)}
                onOpenProfile={onOpenProfile}
          />
        </div>
      ) : (
        <Channel key={activeChannel?.id || activeChannel?.cid} channel={activeChannel} doConnect={false}>
          <Window>
            <div className="chat-view-topbar">
              <div className="chat-view-topbar-main">
                {isGroupChat ? <GroupHeader groupImage={groupImage} groupTitle={groupTitle} membersCount={activeChannel?.data?.members?.length} /> : <PersonalHeader channel={activeChannel} currentUserId={authUser?.uid} />}
              </div>

              {isGroupChat && (
                <button
                  type="button"
                  onClick={() => setShowGroupSettings(true)}
                  className="group-settings-btn group-settings-btn-primary"
                >
                  ⚙️ Grupo
                </button>
              )}
            </div>
            <MessageList />
            <MessageTimestampInjector />
            <AudioRecorderInput channel={activeChannel} authUser={authUser} isGroupChat={isGroupChat} />
          </Window>
          <Thread />
        </Channel>
      )}
    </div>
  )
}
