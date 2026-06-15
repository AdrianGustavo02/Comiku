import { useEffect } from 'react'

function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export default function MessageTimestampInjector() {
  useEffect(() => {
    const injectTimestamps = () => {
      // Buscar todos los contenedores de mensajes
      const messages = document.querySelectorAll('.str-chat__message')
      
      messages.forEach((messageContainer) => {
        // Si ya tiene timestamp inyectado, saltar
        if (messageContainer.querySelector('.injected-timestamp')) {
          return
        }

        // Buscar el elemento time
        const timeElement = messageContainer.querySelector('time')
        if (!timeElement) {
          return
        }

        const timestamp = timeElement.getAttribute('datetime')
        if (!timestamp) return

        const time = formatTime(new Date(timestamp))
        if (!time) return

        // Buscar el contenedor .str-chat__message-inner (contiene el contenido del mensaje)
        const messageInner = messageContainer.querySelector('.str-chat__message-inner')
        if (!messageInner) return

        // Evitar reescribir mensajes con controles interactivos, como audio o botones de adjuntos.
        if (messageInner.querySelector('audio, video, button, input, select, textarea, [role="button"]')) {
          return
        }

        // Crear wrapper flex para alinear contenido + hora
        const flexWrapper = document.createElement('div')
        flexWrapper.className = 'injected-timestamp-wrapper'
        flexWrapper.style.cssText = `
          display: flex;
          align-items: flex-end;
          gap: 8px;
          width: 100%;
        `

        // Crear el elemento de hora
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

        // Obtener el contenido interno del mensaje
        const children = Array.from(messageInner.childNodes)
        
        // Filtrar para obtener solo los nodos relevantes (evitar comentarios, etc)
        const contentNodes = children.filter(node => {
          if (node.nodeType === 3) return false // Ignorar text nodes vacíos
          if (node.classList && node.classList.contains('str-chat__message-timestamp-wrapper')) return false
          return true
        })

        if (contentNodes.length > 0) {
          // Mover el contenido al wrapper
          contentNodes.forEach(node => {
            flexWrapper.appendChild(node.cloneNode(true))
          })
          
          // Agregar la hora
          flexWrapper.appendChild(timeDiv)

          // Reemplazar el contenido de messageInner
          messageInner.innerHTML = ''
          messageInner.appendChild(flexWrapper)
        }
      })
    }

    // Ejecutar inmediatamente
    const timeoutId = setTimeout(injectTimestamps, 100)

    // Observar cambios
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
    }
  }, [])

  return null
}




