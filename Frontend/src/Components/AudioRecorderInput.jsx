import React, { useEffect, useRef, useState } from 'react'
import { STREAM_MAX_UPLOAD_SIZE_BYTES, STREAM_SUPPORTED_IMAGE_MIME_TYPES, sendMessageWithFiles } from '../firebase/stream'
import { canSendMessageTo } from '../firebase/user'
import '../styles/AudioRecorderInput.css'

const STREAM_IMAGE_ACCEPT = [
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.svg',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/svg+xml',
].join(',')

const PREFERRED_AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm'
  }

  return PREFERRED_AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || 'audio/webm'
}

//Formateo de tamaño de archivo en B, KB o MB.
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

//Iconos SVG para los botones de enviar, grabar, detener y adjuntar imagen.
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2 3v7.5l12 1.5-12 1.5V21l20-9L2 3Z" fill="currentColor" />
    </svg>
  )
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 1 1-14 0 1 1 0 1 1 2 0 5 5 0 1 0 10 0Zm-4 8.93V22a1 1 0 1 1-2 0v-2.07a1 1 0 1 1 2 0Z" fill="currentColor" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5Zm0 2h14a1 1 0 0 1 1 1v7.3l-3.35-3.36a1 1 0 0 0-1.4 0l-2.7 2.7-1.95-1.95a1 1 0 0 0-1.42 0L4 16.82V7a1 1 0 0 1 1-1Zm0 12 4.85-4.85 1.95 1.95a1 1 0 0 0 1.42 0l2.7-2.7L20 16.48V17a1 1 0 0 1-1 1H5Zm10-7.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" fill="currentColor" />
    </svg>
  )
}

export default function AudioRecorderInput({ channel, authUser, isGroupChat }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [sendingDisabled, setSendingDisabled] = useState(false)
  const [disabledReason, setDisabledReason] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const [selectedImages, setSelectedImages] = useState([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const canvasRef = useRef(null)
  const timerRef = useRef(null)
  const pendingAutoSendRef = useRef(false)
  const imageInputRef = useRef(null)
  const messageInputRef = useRef(null)
  const selectedImagesRef = useRef([])
  const audioMimeTypeRef = useRef('audio/webm')

  //Auto ajusto la altura del textarea segun el contenido.
  useEffect(() => {
    const textarea = messageInputRef.current

    if (!textarea) {
      return
    }

    const computedStyle = window.getComputedStyle(textarea)
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0
    const minHeight = 44
    const maxHeight = Math.round(lineHeight * 4 + paddingTop + paddingBottom)

    textarea.style.height = `${minHeight}px`

    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [text])

  //Limpio recursos cuando el componente se desmonta.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      selectedImagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.previewUrl)
      })
    }
  }, [audioUrl])

  useEffect(() => {
    selectedImagesRef.current = selectedImages
  }, [selectedImages])

  //Verifico si el usuario tiene permiso para enviar mensajes al destinatario.
  useEffect(() => {
    if (isGroupChat || !authUser || !channel) {
      setSendingDisabled(false)
      setDisabledReason('')
      return
    }

    const checkPermission = async () => {
      try {
        const allowed = await canSendMessageTo(authUser.uid, channel)
        if (!allowed) {
          setSendingDisabled(true)
          setDisabledReason('No puedes enviar mensajes a este usuario')
        } else {
          setSendingDisabled(false)
          setDisabledReason('')
        }
      } catch (err) {
        console.error('Error al verificar el permiso de mensajería:', err)
        setSendingDisabled(false)
        setDisabledReason('')
      }
    }

    checkPermission()
  }, [authUser, channel, isGroupChat])

  //Limpio las imágenes seleccionadas y sus URLs de vista previa.
  function clearSelectedImages() {
    selectedImagesRef.current.forEach((image) => {
      URL.revokeObjectURL(image.previewUrl)
    })
    selectedImagesRef.current = []
    setSelectedImages([])
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  //Elimino una imagen seleccionada y libero su URL de vista previa.
  function removeSelectedImage(imageId) {
    setSelectedImages((currentImages) => {
      const imageToRemove = currentImages.find((image) => image.id === imageId)

      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.previewUrl)
      }

      const nextImages = currentImages.filter((image) => image.id !== imageId)
      selectedImagesRef.current = nextImages
      return nextImages
    })
  }

  //Manejo la selección de imágenes, validando el tipo y tamaño de archivo, y generando URLs de vista previa.
  function handleImageSelection(event) {
    const files = Array.from(event.target.files || [])

    if (!files.length) {
      return
    }

    const errors = []
    const validImages = []

    files.forEach((file) => {
      if (!STREAM_SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
        errors.push(`${file.name} no es un formato de imagen compatible.`)
        return
      }

      if (file.size > STREAM_MAX_UPLOAD_SIZE_BYTES) {
        errors.push(`${file.name} supera el límite de 100 MB.`)
        return
      }

      validImages.push(file)
    })

    if (errors.length) {
      alert(errors.join('\n'))
    }

    if (!validImages.length) {
      event.target.value = ''
      return
    }

    const nextImages = validImages.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))

    setSelectedImages((currentImages) => [...currentImages, ...nextImages])
    event.target.value = ''
  }

  //Limpio el audio.
  function clearAudioSelection() {
    setAudioBlob(null)

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }

    setAudioUrl(null)

    setUploadProgress(0)
  }

  //Inicio la grabacion de audio.
  async function startRecording() {
    try {
      pendingAutoSendRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const selectedMimeType = getSupportedAudioMimeType()
      audioMimeTypeRef.current = selectedMimeType
      mediaRecorderRef.current = MediaRecorder.isTypeSupported(selectedMimeType)
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      setRecordingSeconds(0)
      setAudioBlob(null)

      if (timerRef.current) {
        clearInterval(timerRef.current)
      }

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: audioMimeTypeRef.current || 'audio/webm' })
        const shouldAutoSend = pendingAutoSendRef.current

        if (!shouldAutoSend) {
          const url = URL.createObjectURL(blob)
          setAudioBlob(blob)
          setAudioUrl(url)
          drawWaveformFromBlob(blob)
        }

        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        if (shouldAutoSend) {
          pendingAutoSendRef.current = false
          await uploadAudioAndSend(blob)
        }
      }

      mediaRecorderRef.current.start()
      setRecording(true)
    } catch (err) {
      console.error('No se pudo iniciar la grabación:', err)
      alert('No se pudo acceder al micrófono. Revisa permisos.')
    }
  }

  //Detengo la grabacion de audio.
  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  //Subo el audio o imagenes y los envio. Pueden ser ambos a la vez.
  async function uploadAudioAndSend(blobToSend = audioBlob) {
    if (!channel) return

    try {
      setIsUploading(true)

      const filesToSend = [...selectedImagesRef.current.map((image) => image.file)]

      if (blobToSend) {
        const mimeType = blobToSend.type || audioMimeTypeRef.current || 'audio/webm'
        const audioExtension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
        const fileName = `audio-${Date.now()}.${audioExtension}`
        const file = blobToSend instanceof File
          ? blobToSend
          : new File([blobToSend], fileName, { type: mimeType })

        filesToSend.unshift(file)
      }

      if (!filesToSend.length) {
        setIsUploading(false)
        return
      }

      setUploadProgress(25)

      await sendMessageWithFiles({
        channel,
        text: text.trim(),
        files: filesToSend,
      })

      setUploadProgress(100)
      setText('')
      clearAudioSelection()
      clearSelectedImages()
      setIsUploading(false)
      setUploadProgress(0)
    } catch (err) {
      console.error('Error en uploadAudioAndSend:', err)
      alert('No se pudo enviar el mensaje con adjuntos. Revisa la consola para más detalles.')
      setIsUploading(false)
    }
  }

  //Elimino el audio grabado.
  function removeAudio() {
    clearAudioSelection()
  }

  //Envio el mensaje de texto, audio o imagenes. Si estoy grabando, detengo la grabación y envio el audio.
  async function handleSend() {
    if (sendingDisabled) {
      alert(disabledReason)
      return
    }

    if (recording) {
      pendingAutoSendRef.current = true
      stopRecording()
      return
    }

    if (audioBlob || selectedImages.length > 0) {
      await uploadAudioAndSend(audioBlob)
    } else if (text.trim()) {
      try {
        await channel.sendMessage({ text })
        setText('')
      } catch (err) {
        console.error('Error enviando texto:', err)
      }
    }
  }


  //Dibujo la forma de onda del audio en un canvas a partir del blob de audio.
  async function drawWaveformFromBlob(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

      const raw = audioBuffer.getChannelData(0)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const step = Math.ceil(raw.length / width)
      const amp = height / 2

      ctx.fillStyle = '#f3f3f3'
      ctx.fillRect(0, 0, width, height)
      ctx.lineWidth = 1
      ctx.strokeStyle = '#4a90e2'
      ctx.beginPath()

      for (let i = 0; i < width; i++) {
        let min = 1.0
        let max = -1.0
        for (let j = 0; j < step; j++) {
          const datum = raw[i * step + j]
          if (datum < min) min = datum
          if (datum > max) max = datum
        }
        ctx.moveTo(i, (1 + min) * amp)
        ctx.lineTo(i, (1 + max) * amp)
      }

      ctx.stroke()
    } catch (err) {
      console.error('Error dibujando ondas de audio:', err)
    }
  }

  return (
    <div className="audio-input">
      <div className="composer-row">
        <div className="text-send text-send-inline">
          <textarea
            ref={messageInputRef}
            placeholder="Escribe un mensaje..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={isUploading || sendingDisabled}
          />
          <button
            type="button"
            onClick={handleSend}
            className="btn-send btn-send-icon"
            disabled={isUploading || sendingDisabled || (!text.trim() && !audioBlob && selectedImages.length === 0 && !recording)}
            aria-label={recording ? 'Detener y enviar' : audioBlob ? 'Enviar audio' : selectedImages.length > 0 ? 'Enviar imagenes' : 'Enviar mensaje'}
            title={recording ? 'Detener y enviar' : audioBlob ? 'Enviar audio' : selectedImages.length > 0 ? 'Enviar imagenes' : 'Enviar mensaje'}
          >
            <SendIcon />
          </button>
        </div>

        <div className="attachment-tools attachment-tools-inline">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className={`btn-round-icon ${recording ? 'btn-stop' : 'btn-record'}`}
            disabled={isUploading || sendingDisabled}
            aria-label={recording ? 'Detener grabacion' : 'Grabar audio'}
            title={recording ? 'Detener grabacion' : 'Grabar audio'}
          >
            {recording ? <StopIcon /> : <MicrophoneIcon />}
          </button>

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="btn-round-icon btn-attach"
            disabled={isUploading || recording}
            aria-label="Adjuntar imagen"
            title="Adjuntar imagen"
          >
            <ImageIcon />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept={STREAM_IMAGE_ACCEPT}
            multiple
            onChange={handleImageSelection}
            className="attachment-input"
          />
        </div>
      </div>

      {audioUrl && (
        <div className="audio-preview audio-preview-inline">
          <div className="audio-preview-meta">
            <canvas ref={canvasRef} width={220} height={34} />
          </div>
          <audio controls src={audioUrl} className="audio-preview-player-control" />
          <button type="button" onClick={removeAudio} className="btn-remove audio-remove-button">Eliminar</button>
        </div>
      )}

      {selectedImages.length > 0 && (
        <div className="image-preview-grid">
          {selectedImages.map((image) => (
            <article key={image.id} className="image-preview-card">
              <img src={image.previewUrl} alt={image.file.name} className="image-preview-thumb" />
              <div className="image-preview-meta">
                <div className="image-preview-name">{image.file.name}</div>
                <div className="image-preview-size">{formatFileSize(image.file.size)}</div>
              </div>
              <button type="button" onClick={() => removeSelectedImage(image.id)} className="btn-remove image-remove-button">
                Quitar
              </button>
            </article>
          ))}
        </div>
      )}

      {recording && (
        <div className="recording-indicator" aria-live="polite">
          <div className="recording-badge">
            <span className="recording-dot" />
            Grabando audio {recordingSeconds > 0 ? `${recordingSeconds}s` : ''}
          </div>
          <div className="recording-bars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {uploadProgress > 0 && (
        <div className="upload-progress">
          <div className="bar upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
          <div className="percent">{uploadProgress}%</div>
        </div>
      )}
    </div>
  )
}
