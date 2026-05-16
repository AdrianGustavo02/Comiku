import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import { createCompressedImageDataUrl } from '../constants/imageUpload'
import { createCroppedImageDataUrl } from '../constants/imageCrop'

function ImageCropperModal({
  open,
  imageSrc,
  title = 'Recortar imagen',
  subtitle = 'Ajusta el encuadre antes de guardar la foto.',
  confirmLabel = 'Usar imagen recortada',
  cancelLabel = 'Cancelar',
  aspect = 1,
  onCancel,
  onConfirm,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }

    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setIsProcessing(false)
    setError('')
  }, [open, imageSrc])

  if (!open || !imageSrc) {
    return null
  }

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      setError('Mueve o ajusta la imagen antes de continuar.')
      return
    }

    try {
      setIsProcessing(true)
      setError('')

      const croppedDataUrl = await createCroppedImageDataUrl(imageSrc, croppedAreaPixels)
      const compressedDataUrl = await createCompressedImageDataUrl(croppedDataUrl, {
        maxWidth: 512,
        maxHeight: 512,
        maxBytes: 500 * 1024,
      })

      await onConfirm?.(compressedDataUrl)
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : 'No se pudo recortar la imagen.',
      )
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      role="presentation"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-cropper-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(920px, 100%)',
          borderRadius: 20,
          background: 'linear-gradient(180deg, #ffffff, #f8fafc)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 20px 12px' }}>
          <p className="eyebrow">Comiku / Foto de perfil</p>
          <h2 id="image-cropper-title" style={{ margin: '6px 0 8px' }}>{title}</h2>
          <p className="helper-text" style={{ margin: 0 }}>{subtitle}</p>
        </div>

        <div style={{ position: 'relative', width: '100%', height: 'min(64vh, 560px)', background: '#0f172a' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
            onZoomChange={setZoom}
            showGrid
            objectFit="horizontal-cover"
          />
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          <label htmlFor="image-cropper-zoom" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
            Zoom
          </label>
          <input
            id="image-cropper-zoom"
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            style={{ width: '100%' }}
            disabled={isProcessing}
          />

          {error ? <p className="form-message error" style={{ marginTop: 12 }}>{error}</p> : null}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="profile-back-button" onClick={onCancel} disabled={isProcessing}>
              {cancelLabel}
            </button>
            <button type="button" className="delete-account-button" onClick={handleConfirm} disabled={isProcessing}>
              {isProcessing ? 'Recortando...' : confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ImageCropperModal