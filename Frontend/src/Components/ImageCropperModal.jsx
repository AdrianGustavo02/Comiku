import { useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import { createCompressedImageDataUrl } from '../constants/imageUpload'
import { createCroppedImageDataUrl } from '../constants/imageCrop'
import '../styles/ImageCropperModal.css'

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
  const dialogRef = useRef(null)

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

  useEffect(() => {
    if (!open) {
      return
    }

    dialogRef.current?.focus({ preventScroll: false })
    dialogRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [open])

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
      className="image-cropper-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <section
        className="image-cropper-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-cropper-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="image-cropper-header">
          <h2 id="image-cropper-title" className="image-cropper-title">{title}</h2>
          <p className="helper-text image-cropper-subtitle">{subtitle}</p>
        </div>

        <div className="image-cropper-crop-area">
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

        <div className="image-cropper-footer">
          <label htmlFor="image-cropper-zoom" className="image-cropper-zoom-label">
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
            className="image-cropper-zoom-input"
            disabled={isProcessing}
          />

          {error ? <p className="form-message error image-cropper-error">{error}</p> : null}

          <div className="image-cropper-actions">
            <button type="button" className="image-cropper-button image-cropper-button-cancel" onClick={onCancel} disabled={isProcessing}>
              {cancelLabel}
            </button>
            <button type="button" className="image-cropper-button image-cropper-button-confirm" onClick={handleConfirm} disabled={isProcessing}>
              {isProcessing ? 'Recortando...' : confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ImageCropperModal