import { StreamChat } from 'stream-chat'
import { auth } from './firebase'
import { db } from './firebase'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
export const STREAM_MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024
export const STREAM_SUPPORTED_IMAGE_MIME_TYPES = [
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/svg+xml',
]

let client = null

function isSupportedImageFile(file) {
  return file instanceof File && STREAM_SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)
}

function assertStreamAttachmentCanBeUploaded(file) {
  if (!(file instanceof File)) {
    throw new Error('El adjunto no es un archivo válido.')
  }

  if (file.size > STREAM_MAX_UPLOAD_SIZE_BYTES) {
    throw new Error('Stream Chat permite archivos de hasta 100 MB.')
  }
}

async function uploadAttachmentToChannel(channel, file, onUploadProgress) {
  const uploadOptions = onUploadProgress
    ? {
        onUploadProgress,
      }
    : undefined

  if (isSupportedImageFile(file)) {
    return channel.sendImage(file, file.name || 'image', file.type, undefined, uploadOptions)
  }

  return channel.sendFile(file, file.name || 'attachment', file.type, undefined, uploadOptions)
}

async function parseJsonResponse(response) {
  const rawBody = await response.text()

  if (!rawBody) {
    return null
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return { rawBody }
  }
}

export async function getStreamToken() {
  const idToken = await getIdTokenFromFirebase()
  const resp = await fetch(`${BACKEND_BASE}/api/stream/token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = await resp.json()

  if (!resp.ok) {
    throw new Error(payload?.message || 'No se obtuvo token de StreamChat')
  }

  return payload
}

export async function initStreamClient({ apiKey, token, user }) {
  if (!apiKey || !token) {
    throw new Error('apiKey y token son requeridos para inicializar Stream')
  }
  try {
    if (client && client.userID === user.id) {
      return client
    }
  } catch {
  }

  if (client) {
    try {
      await client.disconnectUser()
    } catch {
    }
    client = null
  }

  //Intento conectar el cliente de StreamChat 
  // con un maximo de 3 reintentos en caso de errores como rate limits.
  const maxAttempts = 3
  let attempt = 0
  let lastErr = null

  while (attempt < maxAttempts) {
    attempt += 1
    client = new StreamChat(apiKey)

    try {
      await client.connectUser(user, token)
      return client
    } catch (err) {
      lastErr = err

      try {
        await client.disconnectUser()
      } catch {
      }
      client = null

      const statusCode = err?.StatusCode || err?.statusCode || err?.code
      const isRateLimit = statusCode === 429 || String(err?.message || '').toLowerCase().includes('demasiadas solicitudes')

      if (attempt >= maxAttempts) {
        if (isRateLimit) {
          const wrapped = new Error('Rate limit al conectar WebSocket a StreamChat (429). Espera unos segundos antes de reintentar.')
          wrapped.original = err
          throw wrapped
        }
        throw err
      }

      const delay = Math.min(2000, 500 * Math.pow(2, attempt - 1))
      //Si es un error de rate limit, aseguro un mínimo de 1 segundo de espera 
      // para dar tiempo a que se liberen los recursos en StreamChat.
      const wait = isRateLimit ? Math.max(delay, 1000) : delay

      await new Promise((res) => setTimeout(res, wait))
    }
  }

  throw lastErr || new Error('No fue posible inicializar StreamChat')
}

export function getStreamClient() {
  return client
}

//Creo un chat entre dos usuarios.
export async function createOrGet1to1Channel({ members }) {
  if (!client || !client.userID) throw new Error('Stream client no inicializado o no conectado')

  if (!Array.isArray(members) || members.length !== 2) {
    throw new Error('members debe ser array de 2 uids')
  }

  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'messaging',
      members,
      metadata: {},
    }),
  })

  const payload = await response.json()

  if (!response.ok || !payload?.channel?.id) {
    throw new Error(payload?.message || 'No fue posible crear el canal de chat')
  }

  const channel = client.channel(payload.channel.type || 'messaging', payload.channel.id, {
    members,
  })
  await channel.watch()
  return channel
}

//Creo un nuevo chat grupal con sus datos.
export async function createGroupChannel({ name, members, metadata = {}, description = null, imageUrl = null }) {
  if (!client || !client.userID) throw new Error('Stream client no inicializado o no conectado')

  if (!Array.isArray(members) || members.length < 3) {
    throw new Error('Un chat grupal requiere al menos 3 miembros.')
  }

  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'messaging',
      members,
      metadata: {
        ...metadata,
        name,
      },
      groupName: name,
      groupDescription: description,
      groupImageUrl: imageUrl,
    }),
  })

  const payload = await response.json()

  if (!response.ok || !payload?.channel?.id) {
    throw new Error(payload?.message || 'No fue posible crear el chat grupal')
  }

  const channel = client.channel(payload.channel.type || 'messaging', payload.channel.id, {
    members,
    ...metadata,
    name,
  })
  await channel.watch()
  return channel
}

//Manejo el envio de imagenes y audios.
export async function sendMessageWithFiles({ channel, text = '', files = [] }) {
  if (!client) throw new Error('Stream client no inicializado')
  if (!channel) throw new Error('Channel es requerido')

  const attachments = []

  for (const file of files) {
    assertStreamAttachmentCanBeUploaded(file)

    const uploadRes = await uploadAttachmentToChannel(channel, file)

    if (isSupportedImageFile(file)) {
      attachments.push({
        type: 'image',
        asset_url: uploadRes.file,
        thumb_url: uploadRes.file,
        title: file.name || 'image',
      })
      continue
    }

    attachments.push({
      type: file.type?.startsWith('audio') ? 'audio' : 'file',
      asset_url: uploadRes.file,
      mime_type: file.type || 'audio/webm',
      title: file.name || 'attachment',
    })
  }

  if (attachments.length > 0) {
    await channel.sendMessage({ text, attachments })
    return
  }

  if (text?.trim()) {
    await channel.sendMessage({ text })
  }
}

//Obtengo el token de autenticación del usuario en Firebase 
// para autorizar las peticiones al backend relacionadas con StreamChat.
async function getIdTokenFromFirebase() {
  if (!auth) {
    throw new Error('Firebase auth no configurado')
  }

  const user = auth.currentUser

  if (!user) {
    throw new Error('No hay usuario autenticado en Firebase')
  }

  return user.getIdToken()
}

export async function enrichChannelWithFirestoreData(channel) {
  if (!channel || !channel.id) {
    return channel
  }

  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const channelDoc = await getDoc(doc(db, 'streamChannels', channel.id))

    if (channelDoc.exists()) {
      const firestoreData = channelDoc.data()

      if (!channel.data) {
        channel.data = {}
      }

      channel.data.groupName = firestoreData.groupName || channel.data.name
      channel.data.groupDescription = firestoreData.groupDescription || ''
      channel.data.groupImageUrl = firestoreData.groupImageUrl || null
      channel.data.image = firestoreData.groupImageUrl || channel.data.image || null
      channel.data.members = firestoreData.members || []
      channel.data.admins = firestoreData.admins || []
      channel.data.createdBy = firestoreData.createdBy
    }
  } catch (error) {
  }

  return channel
}

//Permite actualizar los datos de un grupo de chat.
export async function updateGroupChannel({ channelId, groupName = null, groupDescription = null, groupImageUrl = null }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/${channelId}/update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      groupName,
      groupDescription,
      groupImageUrl,
    }),
  })

  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(payload?.message || payload?.rawBody || 'No fue posible actualizar el grupo.')
  }

  return payload
}

//Permite agregar nuevos miembros a un grupo de chat existente.
export async function addGroupMembers({ channelId, newMemberUids = [] }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/${channelId}/add-members`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      newMemberUids,
    }),
  })

  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(payload?.message || payload?.rawBody || 'No fue posible agregar miembros.')
  }

  return payload
}

//Permite promover a un miembro del grupo de chat a admin.
export async function makeGroupAdmin({ channelId, userUid }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/${channelId}/make-admin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userUid,
    }),
  })

  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(payload?.message || payload?.rawBody || 'No fue posible promover a admin.')
  }

  return payload
}

//Permite eliminar a un miembro del grupo de chat.
export async function removeGroupMember({ channelId, memberUid }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/${channelId}/remove-member`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ memberUid }),
  })

  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(payload?.message || payload?.rawBody || 'No fue posible eliminar al miembro.')
  }

  return payload
}

//Permite a un miembro abandonar el grupo de chat.
export async function leaveGroupChannel({ channelId }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/channels/${channelId}/leave`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(payload?.message || payload?.rawBody || 'No fue posible abandonar el grupo.')
  }

  return payload
}

//Busco canales de chat por su ID.
export async function adminSearchChats({ id }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/admin/search-chats`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  })

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'No fue posible buscar chats')
  }

  return payload.channels || []
}

//Obtengo los detalles de un canal de chat, solo para administradores.
export async function adminGetChannelDetails({ channelId }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/stream/admin/channel/${encodeURIComponent(channelId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'No fue posible obtener detalles del canal')
  }

  return payload
}

//Elimino un grupo de chat, solo para administradores de este.
export async function adminDeleteChannel({ channelId }) {
  const idToken = await getIdTokenFromFirebase()
  const response = await fetch(`${BACKEND_BASE}/api/admin/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(payload?.message || 'No fue posible eliminar el canal')
  }

  return payload
}
