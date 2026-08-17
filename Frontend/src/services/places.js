const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export async function searchNearbyBookstores({ authUser, latitude, longitude, radius }) {
  if (!authUser?.getIdToken) {
    throw new Error('Debes iniciar sesión para buscar comercios cercanos.')
  }

  const idToken = await authUser.getIdToken()
  const response = await fetch(`${BACKEND_BASE_URL}/api/places/nearby-bookstores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ latitude, longitude, radius }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || 'No fue posible buscar comercios cercanos.')
  }

  return Array.isArray(payload.places) ? payload.places : []
}