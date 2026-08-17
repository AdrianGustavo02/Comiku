import { useState } from 'react'
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  Pin,
} from '@vis.gl/react-google-maps'
import { searchNearbyBookstores } from '../services/places'

const DEFAULT_RADIUS = 20000
const EXTENDED_RADIUS = 50000

function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${distanceMeters} m`
  }

  return `${(distanceMeters / 1000).toFixed(1).replace('.', ',')} km`
}

function getLocationErrorMessage(error) {
  if (error?.code === 1) {
    return 'Necesitamos permiso de ubicación para mostrar comercios cercanos.'
  }

  if (error?.code === 2) {
    return 'No fue posible determinar tu ubicación actual.'
  }

  if (error?.code === 3) {
    return 'La búsqueda de tu ubicación tardó demasiado. Intenta nuevamente.'
  }

  return 'No fue posible acceder a tu ubicación.'
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 300000,
    })
  })
}

function NearbyBookstores({ authUser, volumeTitle }) {
  const [userLocation, setUserLocation] = useState(null)
  const [places, setPlaces] = useState([])
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_DEMO_API_KEY

  async function loadNearbyPlaces(nextRadius = radius) {
    if (!navigator.geolocation) {
      setError('Tu navegador no permite obtener la ubicación.')
      return
    }

    try {
      setLoading(true)
      setError('')
      setSelectedPlace(null)

      const position = await getCurrentPosition()
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      const nearbyPlaces = await searchNearbyBookstores({
        authUser,
        ...location,
        radius: nextRadius,
      })

      setUserLocation(location)
      setPlaces(nearbyPlaces)
      setRadius(nextRadius)
    } catch (requestError) {
      setError(
        typeof requestError?.code === 'number'
          ? getLocationErrorMessage(requestError)
          : requestError instanceof Error
            ? requestError.message
            : 'No fue posible buscar comercios cercanos.',
      )
    } finally {
      setLoading(false)
    }
  }

  const userPosition = userLocation
    ? { lat: userLocation.latitude, lng: userLocation.longitude }
    : null

  return (
    <section className="nearby-stores" aria-labelledby="nearby-stores-title">
      <div className="nearby-stores-header">
        <div>
          <p className="nearby-stores-eyebrow">Compra local</p>
          <h2 id="nearby-stores-title">¿Dónde comprar este tomo?</h2>
          <p>
            Busca comiquerías y librerías cercanas. Comiku no conoce la disponibilidad
            de {volumeTitle}; consulta el stock directamente con el comercio.
          </p>
        </div>
        <button
          type="button"
          className="nearby-stores-search-button"
          onClick={() => loadNearbyPlaces(radius)}
          disabled={loading || !authUser}
        >
          {loading ? 'Buscando...' : userLocation ? 'Actualizar búsqueda' : 'Buscar cerca mío'}
        </button>
      </div>

      {!authUser ? (
        <p className="nearby-stores-message">Inicia sesión para buscar comercios cercanos.</p>
      ) : null}
      {error ? <p className="form-message error">{error}</p> : null}

      {userPosition ? (
        <>
          <div className="nearby-stores-radius" aria-label="Radio de búsqueda">
            <button
              type="button"
              className={radius === DEFAULT_RADIUS ? 'active' : ''}
              onClick={() => loadNearbyPlaces(DEFAULT_RADIUS)}
              disabled={loading}
            >
              20 km
            </button>
            <button
              type="button"
              className={radius === EXTENDED_RADIUS ? 'active' : ''}
              onClick={() => loadNearbyPlaces(EXTENDED_RADIUS)}
              disabled={loading}
            >
              50 km
            </button>
          </div>

          {mapsApiKey ? (
            <div className="nearby-stores-map" aria-label="Mapa de comercios cercanos">
              <APIProvider apiKey={mapsApiKey} language="es" region="AR">
                <Map
                  defaultCenter={userPosition}
                  defaultZoom={12}
                  mapId="DEMO_MAP_ID"
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                >
                  <AdvancedMarker position={userPosition} title="Tu ubicación">
                    <Pin background="#2563eb" borderColor="#ffffff" glyphColor="#ffffff" />
                  </AdvancedMarker>

                  {places.map((place) => (
                    <AdvancedMarker
                      key={place.id}
                      position={{ lat: place.latitude, lng: place.longitude }}
                      title={place.name}
                      onClick={() => setSelectedPlace(place)}
                    >
                      <Pin background="#f97316" borderColor="#7c2d12" glyphColor="#ffffff" />
                    </AdvancedMarker>
                  ))}

                  {selectedPlace ? (
                    <InfoWindow
                      position={{ lat: selectedPlace.latitude, lng: selectedPlace.longitude }}
                      onCloseClick={() => setSelectedPlace(null)}
                    >
                      <div className="nearby-store-info-window">
                        <strong>{selectedPlace.name}</strong>
                        <span>{formatDistance(selectedPlace.distanceMeters)}</span>
                      </div>
                    </InfoWindow>
                  ) : null}
                </Map>
              </APIProvider>
            </div>
          ) : (
            <p className="nearby-stores-message">
              Falta configurar la clave del mapa en el frontend.
            </p>
          )}

          {places.length === 0 && !loading ? (
            <p className="nearby-stores-message">
              No encontramos comercios dentro de este radio. Prueba ampliando la búsqueda.
            </p>
          ) : (
            <ol className="nearby-stores-list">
              {places.map((place) => (
                <li key={place.id} className="nearby-store-item">
                  <div className="nearby-store-number" aria-hidden="true">
                    {places.indexOf(place) + 1}
                  </div>
                  <div className="nearby-store-content">
                    <div className="nearby-store-title-row">
                      <h3>{place.name}</h3>
                      <span>{formatDistance(place.distanceMeters)}</span>
                    </div>
                    <p>{place.address}</p>
                    <div className="nearby-store-links">
                      <a href={place.googleMapsUrl} target="_blank" rel="noreferrer">
                        Ver en Google Maps
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}&destination_place_id=${place.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Cómo llegar
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}
    </section>
  )
}

export default NearbyBookstores