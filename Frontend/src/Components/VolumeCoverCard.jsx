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
        {comicName && <strong className="volume-cover-comic-name">{comicName}</strong>}
        <span className="volume-cover-tomo">{formatVolumeTitle(volume)}</span>
        <span className="volume-cover-isbn">ISBN: {volume.isbn || 'No definido'}</span>
      </div>
    </button>
  )
}

export default VolumeCoverCard