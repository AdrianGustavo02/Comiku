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
    }
  }, [])

  return null
}




