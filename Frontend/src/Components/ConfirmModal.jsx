import '../styles/Modal.css'

function ConfirmModal({ title = 'Confirmar', message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <header className="modal-header">
          <h3>{title}</h3>
        </header>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <footer className="modal-footer">
          <button className="secondary-button" onClick={onCancel} type="button">Cancelar</button>
          <button className="danger-button" onClick={onConfirm} type="button">Desestimar</button>
        </footer>
      </div>
    </div>
  )
}

export default ConfirmModal
