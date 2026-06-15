import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/Modal.css'

function ConfirmModal({
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
  confirmDisabled = false,
}) {
  const dialogRef = useRef(null)
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!confirmDisabled) {
      setIsConfirming(false)
    }
  }, [confirmDisabled])

  const handleConfirm = async () => {
    if (confirmDisabled || isConfirming) return

    try {
      setIsConfirming(true)
      await onConfirm?.()
    } finally {
      if (!confirmDisabled) {
        setIsConfirming(false)
      }
    }
  }

  const modal = (
    <div className="modal-backdrop">
      <div className="modal-card" ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <header className="modal-header">
          <h5 className="attention">ATENCIÓN</h5>
          <h3>{title}</h3>
        </header>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <footer className="modal-footer">
          <button className="secondary-button" onClick={onCancel} type="button">Cancelar</button>
          <button
            className="danger-button"
            onClick={handleConfirm}
            type="button"
            disabled={confirmDisabled || isConfirming}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

export default ConfirmModal
