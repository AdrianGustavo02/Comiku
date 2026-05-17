import React from 'react'

function CoverPreview({ src, alt = 'Vista previa de portada' }) {
  if (!src) return null

  return (
    <div className="cover-preview-card">
      <p className="helper-text">Vista previa de portada</p>
      <img className="cover-preview-image" src={src} alt={alt} />
    </div>
  )
}

export default CoverPreview
