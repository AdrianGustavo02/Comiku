import { useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/firebase'

function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function isLikelyUid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(value.trim())
}

export default function MessageTimestampInjector() {
  useEffect(() => {
    const profileCache = new Map()
    const profileUnsubscribers = new Map()

    const getInitial = (value) => {
      const normalized = typeof value === 'string' ? value.trim() : ''
      return (normalized[0] || '?').toUpperCase()
    }

    const renderSenderAvatar = (messageContainer, profile) => {
      const avatarContainer = messageContainer.querySelector('.str-chat__avatar')
      if (!avatarContainer) {
        return
      }

      if (profile?.photoUrl) {
        let imageElement = avatarContainer.querySelector('img')

        if (!imageElement) {
          avatarContainer.innerHTML = ''
          imageElement = document.createElement('img')
          imageElement.setAttribute('data-comiku-avatar', 'true')
          avatarContainer.appendChild(imageElement)
        }

        imageElement.src = profile.photoUrl
        imageElement.alt = profile.nick || 'Avatar'
        imageElement.style.width = '100%'
        imageElement.style.height = '100%'
        imageElement.style.objectFit = 'cover'
        imageElement.style.borderRadius = '50%'
        imageElement.style.display = 'block'
        avatarContainer.style.overflow = 'hidden'
        avatarContainer.style.borderRadius = '50%'
      } else {
        const injectedImage = avatarContainer.querySelector('img[data-comiku-avatar="true"]')

        if (injectedImage) {
          avatarContainer.innerHTML = ''
          const fallback = document.createElement('div')
          fallback.className = 'str-chat__avatar-fallback'
          fallback.textContent = getInitial(profile?.nick)
          avatarContainer.appendChild(fallback)
          return
        }

        const existingFallback = avatarContainer.querySelector('.str-chat__avatar-fallback')
        if (existingFallback) {
          existingFallback.textContent = getInitial(profile?.nick || existingFallback.textContent)
        }
      }
    }

    const injectSenderProfiles = () => {
      const messageContainers = document.querySelectorAll('.str-chat__message')

      messageContainers.forEach((messageContainer) => {
        const senderNameElement = messageContainer.querySelector('.str-chat__message-simple-name')
        if (!senderNameElement) {
          return
        }

        const currentLabel = senderNameElement.textContent?.trim() || ''
        let senderUid = messageContainer.getAttribute('data-comiku-sender-uid') || senderNameElement.getAttribute('data-comiku-sender-uid') || ''

        if (!senderUid && isLikelyUid(currentLabel)) {
          senderUid = currentLabel
        }

        if (!senderUid) {
          return
        }

        messageContainer.setAttribute('data-comiku-sender-uid', senderUid)
        senderNameElement.setAttribute('data-comiku-sender-uid', senderUid)

        if (!profileUnsubscribers.has(senderUid)) {
          const userRef = doc(db, 'usuario', senderUid)
          const unsubscribe = onSnapshot(userRef, (snapshot) => {
            if (!snapshot.exists()) {
              profileCache.set(senderUid, { nick: senderUid, photoUrl: null })
              injectSenderProfiles()
              return
            }

            const data = snapshot.data()
            const nick = typeof data?.Nick === 'string' && data.Nick.trim() ? data.Nick.trim() : senderUid
            const photoUrl = data?.FotoPerfil && typeof data.FotoPerfil === 'object' && data.FotoPerfil.dataUrl
              ? data.FotoPerfil.dataUrl
              : null

            profileCache.set(senderUid, { nick, photoUrl })
            injectSenderProfiles()
          })

          profileUnsubscribers.set(senderUid, unsubscribe)
        }

        const profile = profileCache.get(senderUid)
        if (!profile) {
          return
        }

        if (profile.nick) {
          senderNameElement.textContent = profile.nick
        }

        renderSenderAvatar(messageContainer, profile)
      })
    }

    const injectTimestamps = () => {
      const messages = document.querySelectorAll('.str-chat__message')
      
      messages.forEach((messageContainer) => {
        if (messageContainer.querySelector('.injected-timestamp')) {
          return
        }


        const timeElement = messageContainer.querySelector('time')
        if (!timeElement) {
          return
        }

        const timestamp = timeElement.getAttribute('datetime')
        if (!timestamp) return

        const time = formatTime(new Date(timestamp))
        if (!time) return


        const messageInner = messageContainer.querySelector('.str-chat__message-inner')
        if (!messageInner) return


        if (messageInner.querySelector('audio, video, button, input, select, textarea, [role="button"]')) {
          return
        }

        const flexWrapper = document.createElement('div')
        flexWrapper.className = 'injected-timestamp-wrapper'
        flexWrapper.style.cssText = `
          display: flex;
          align-items: flex-end;
          gap: 8px;
          width: 100%;
        `

        const timeDiv = document.createElement('span')
        timeDiv.className = 'injected-timestamp'
        timeDiv.textContent = time
        timeDiv.style.cssText = `
          font-size: 12px;
          color: #65748b;
          white-space: nowrap;
          flex-shrink: 0;
          margin-left: 4px;
          margin-right: 0;
        `

        const children = Array.from(messageInner.childNodes)
        
        const contentNodes = children.filter(node => {
          if (node.nodeType === 3) return false
          if (node.classList && node.classList.contains('str-chat__message-timestamp-wrapper')) return false
          return true
        })

        if (contentNodes.length > 0) {
          contentNodes.forEach(node => {
            flexWrapper.appendChild(node.cloneNode(true))
          })
          
          flexWrapper.appendChild(timeDiv)


          messageInner.innerHTML = ''
          messageInner.appendChild(flexWrapper)
        }
      })

      injectSenderProfiles()
    }

    const timeoutId = setTimeout(injectTimestamps, 100)


    const observer = new MutationObserver(() => {
      injectTimestamps()
    })

    const messageContainer = document.querySelector('.str-chat__message-list, [role="list"]')
    if (messageContainer) {
      observer.observe(messageContainer, {
        childList: true,
        subtree: true,
      })
    }

    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
      profileUnsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe()
        } catch {
        }
      })
      profileUnsubscribers.clear()
      profileCache.clear()
    }
  }, [])

  return null
}




