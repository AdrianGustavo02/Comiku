import React, { useEffect, useRef, useState } from 'react'
import { STREAM_MAX_UPLOAD_SIZE_BYTES, STREAM_SUPPORTED_IMAGE_MIME_TYPES, sendMessageWithFiles } from '../firebase/stream'

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

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AudioRecorderInput({ channel }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
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
  const selectedImagesRef = useRef([])

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

  function clearAudioSelection() {
    setAudioBlob(null)

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }

    setUploadProgress(0)
  }

  async function startRecording() {
    try {
      pendingAutoSendRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      mediaRecorderRef.current = new MediaRecorder(stream)
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
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        drawWaveformFromBlob(blob)

        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        if (pendingAutoSendRef.current) {
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

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  async function uploadAudioAndSend(blobToSend = audioBlob) {
    if (!channel) return

    try {
      setIsUploading(true)

      const filesToSend = [...selectedImagesRef.current.map((image) => image.file)]

      if (blobToSend) {
        const fileName = `audio-${Date.now()}.webm`
        const file = blobToSend instanceof File
          ? blobToSend
          : new File([blobToSend], fileName, { type: blobToSend.type || 'audio/webm' })

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

  function removeAudio() {
    clearAudioSelection()
  }

  async function handleSend() {
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

  // Draw waveform on canvas from audio blob
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
      console.error('Error dibujando waveform:', err)
    }
  }

  return (
    <div className="audio-input">
      <div className="audio-controls">
        {!recording && (
          <button type="button" onClick={startRecording} className="btn-record">
            Grabar
          </button>
        )}
        {recording && (
          <button type="button" onClick={stopRecording} className="btn-stop">
            Detener
          </button>
        )}
        <div className="attachment-tools">
          <button type="button" onClick={() => imageInputRef.current?.click()} className="btn-attach" disabled={isUploading || recording}>
            Adjuntar imagen
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept={STREAM_IMAGE_ACCEPT}
            multiple
            onChange={handleImageSelection}
            className="attachment-input"
          />
          <span className="attachment-hint">
            JPG, PNG, WEBP, GIF, BMP, HEIC, HEIF o SVG. Máx. 100 MB por archivo.
          </span>
        </div>
        {audioUrl && (
          <div className="audio-preview">
            <div className="audio-preview-header">
              <span className="audio-preview-title">Audio listo</span>
              <button type="button" onClick={removeAudio} className="btn-remove">Eliminar</button>
            </div>
            <canvas ref={canvasRef} width={220} height={34} />
            <audio controls src={audioUrl} />
          </div>
        )}
      </div>

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

      <div className="text-send">
        <input
          placeholder="Escribe un mensaje o graba audio"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isUploading}
        />
        <button type="button" onClick={handleSend} className="btn-send" disabled={isUploading || (!text.trim() && !audioBlob && selectedImages.length === 0 && !recording)}>
          {recording ? 'Detener y enviar' : audioBlob ? 'Enviar audio' : selectedImages.length > 0 ? 'Enviar imágenes' : 'Enviar'}
        </button>
      </div>

      {uploadProgress > 0 && (
        <div className="upload-progress">
          <div className="bar" style={{ width: `${uploadProgress}%`, height: 6, background: '#4a90e2' }} />
          <div className="percent">{uploadProgress}%</div>
        </div>
      )}
    </div>
  )
}
