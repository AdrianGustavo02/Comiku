import '../styles/VolumeCoverCard.css'

function formatVolumeTitle(volume) {
  if (volume.numeroTomo !== null) {
    return `Tomo ${volume.numeroTomo}`
  }

  return 'Tomo único'
}

function VolumeCoverCard({ volume, onOpen, comicName }) {
  return (
    <button
      type="button"
      className="volume-cover-card"
      onClick={() => onOpen(volume)}
    >
      {volume.portada?.dataUrl ? (
        <img
          src={volume.portada.dataUrl}
          alt={`Portada de ${formatVolumeTitle(volume)}`}
        />
      ) : (
        <div className="volume-cover-placeholder">Sin portada</div>
      )}

      <div className="volume-cover-meta">
        {comicName && <span className="volume-cover-comic-name">{comicName}</span>}
        <strong>{formatVolumeTitle(volume)}</strong>
        <span>ISBN: {volume.isbn || 'No definido'}</span>
      </div>
    </button>
  )
}

export default VolumeCoverCard