import React, { useRef } from 'react'

function FileInput({ id, accept, required = false, onFileChange, disabled = false, triggerLabel = 'Seleccionar archivo', initialFileName = '' }) {
  const inputRef = useRef(null)

  const handleTrigger = () => {
    inputRef.current?.click()
  }

  const handleChange = (e) => {
    const file = e.target.files?.[0] || null
    if (typeof onFileChange === 'function') onFileChange(file)
  }

  return (
    <div>
      <input
        accept={accept}
        id={id}
        onChange={handleChange}
        required={required}
        type="file"
        ref={inputRef}
        className="file-input-hidden"
        disabled={disabled}
      />

      <div className="file-input-control">
        <button type="button" className="file-input-trigger" onClick={handleTrigger} disabled={disabled}>
          {triggerLabel}
        </button>
        <span className={`file-input-name ${initialFileName ? 'has-file' : ''}`}>{initialFileName || 'Sin archivo seleccionado'}</span>
      </div>
    </div>
  )
}

export default FileInput
