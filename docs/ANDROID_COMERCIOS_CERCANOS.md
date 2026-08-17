# Android: comercios cercanos para comprar un tomo

## Objetivo

Replicar en la aplicación Android la función web **¿Dónde comprar este tomo?**.

La versión Android debe:

- Pedir permiso de ubicación cuando el usuario pulse el botón de búsqueda.
- Obtener la ubicación actual del dispositivo.
- Consultar el backend de Comiku con un radio de 20 km o 50 km.
- Mostrar una lista de comiquerías, tiendas de cómics, tiendas de manga y librerías.
- Ordenar los resultados por distancia usando el orden recibido del backend.
- Permitir abrir cada comercio en Google Maps.
- Permitir solicitar indicaciones para llegar.
- Informar que Comiku no conoce el stock del tomo.

Android **no debe consultar Google Places directamente**, no debe contener la Maps Demo Key y no debe escribir resultados en Firestore.

## Arquitectura existente

El backend ya implementa este endpoint:

```text
POST /api/places/nearby-bookstores
```

El endpoint:

- Verifica el Firebase ID Token del usuario.
- Consulta Google Places con la clave privada del backend.
- Busca `comiquería`, `tienda de cómics`, `tienda de manga` y `librería`.
- Elimina comercios duplicados.
- Descarta resultados fuera del radio solicitado.
- Calcula la distancia aproximada.
- Devuelve los resultados ordenados de menor a mayor distancia.

Firebase Admin solo se utiliza para validar la sesión. Esta funcionalidad no lee ni escribe comercios en Firestore.

## Contrato HTTP

### Encabezados

```http
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
```

### Cuerpo

```json
{
  "latitude": -34.6037,
  "longitude": -58.3816,
  "radius": 20000
}
```

Valores admitidos para `radius`:

- `20000`: búsqueda inicial de 20 km.
- `50000`: búsqueda ampliada de 50 km.

El backend limita cualquier valor al intervalo entre 1 km y 50 km.

### Respuesta correcta

```json
{
  "ok": true,
  "radius": 20000,
  "places": [
    {
      "id": "PLACE_ID",
      "name": "Nombre del comercio",
      "address": "Dirección completa",
      "latitude": -34.604,
      "longitude": -58.382,
      "businessStatus": "OPERATIONAL",
      "type": "Librería",
      "googleMapsUrl": "https://maps.google.com/PLACE_URL",
      "distanceMeters": 850
    }
  ]
}
```

### Respuesta de error

```json
{
  "ok": false,
  "message": "Descripción del error"
}
```

Estados relevantes:

- `400`: coordenadas inválidas.
- `401`: token ausente, inválido o vencido.
- `500`: Maps Demo Key no configurada en el backend.
- `502`: Google Places no pudo responder.

## Tecnologías recomendadas

Adaptar los nombres y patrones al proyecto Android existente. Si no hay una implementación equivalente, usar:

- Kotlin.
- Jetpack Compose.
- ViewModel y StateFlow.
- Retrofit con un convertidor JSON ya usado por el proyecto.
- Firebase Authentication.
- Google Play Services Location con `FusedLocationProviderClient`.
- Coroutines y `kotlinx-coroutines-play-services` para esperar tareas de Firebase y ubicación.

No agregar Maps SDK for Android: esta versión muestra una lista y abre Google Maps externamente.

## Permisos

Agregar al manifiesto:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

Solicitar `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION` en tiempo de ejecución. Si el usuario solo concede ubicación aproximada, la búsqueda debe continuar con esa ubicación.

No solicitar ubicación en segundo plano.

## Modelos de red

Crear modelos equivalentes a estos, respetando el convertidor JSON del proyecto:

```kotlin
data class NearbyBookstoresRequest(
    val latitude: Double,
    val longitude: Double,
    val radius: Int,
)

data class NearbyBookstoresResponse(
    val ok: Boolean,
    val radius: Int,
    val places: List<NearbyBookstoreDto>,
    val message: String? = null,
)

data class NearbyBookstoreDto(
    val id: String,
    val name: String,
    val address: String,
    val latitude: Double,
    val longitude: Double,
    val businessStatus: String,
    val type: String,
    val googleMapsUrl: String,
    val distanceMeters: Int,
)
```

## Servicio Retrofit

```kotlin
interface PlacesApiService {
    @POST("api/places/nearby-bookstores")
    suspend fun searchNearbyBookstores(
        @Header("Authorization") authorization: String,
        @Body request: NearbyBookstoresRequest,
    ): NearbyBookstoresResponse
}
```

Preferir el interceptor de autenticación existente si el proyecto ya agrega tokens Firebase a otras llamadas. En ese caso, no duplicar el encabezado en cada método.

## Obtención del token Firebase

Antes de llamar al endpoint:

```kotlin
val user = FirebaseAuth.getInstance().currentUser
    ?: throw IllegalStateException("Debes iniciar sesión para buscar comercios cercanos.")

val token = user.getIdToken(false).await().token
    ?: throw IllegalStateException("No fue posible validar la sesión.")

val authorization = "Bearer $token"
```

Ante una respuesta `401`, se puede intentar una sola vez con `getIdToken(true)`. No implementar reintentos infinitos.

## Obtención de ubicación

Usar `FusedLocationProviderClient` después de comprobar el permiso.

Flujo recomendado:

1. Intentar `lastLocation` si existe y es suficientemente reciente.
2. Si no existe, solicitar una ubicación actual con prioridad equilibrada.
3. Mostrar un error claro si la ubicación del dispositivo está desactivada.
4. Enviar latitud y longitud al backend, sin almacenarlas en Firestore.

Ejemplo orientativo:

```kotlin
@SuppressLint("MissingPermission")
suspend fun getCurrentLocation(
    locationClient: FusedLocationProviderClient,
): Location {
    return locationClient
        .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
        .await()
        ?: throw IllegalStateException("No fue posible determinar tu ubicación actual.")
}
```

La anotación no reemplaza la validación del permiso. El llamador debe comprobarlo antes de ejecutar esta función.

## Repositorio

El repositorio debe concentrar autenticación y red:

```kotlin
class NearbyBookstoresRepository(
    private val api: PlacesApiService,
    private val firebaseAuth: FirebaseAuth,
) {
    suspend fun search(
        latitude: Double,
        longitude: Double,
        radius: Int,
    ): List<NearbyBookstoreDto> {
        val user = firebaseAuth.currentUser
            ?: error("Debes iniciar sesión para buscar comercios cercanos.")
        val token = user.getIdToken(false).await().token
            ?: error("No fue posible validar la sesión.")

        return api.searchNearbyBookstores(
            authorization = "Bearer $token",
            request = NearbyBookstoresRequest(latitude, longitude, radius),
        ).places
    }
}
```

Convertir errores HTTP al mensaje enviado por el backend cuando sea posible.

## Estado del ViewModel

Modelar explícitamente estos estados:

```kotlin
sealed interface NearbyBookstoresUiState {
    data object Idle : NearbyBookstoresUiState
    data object RequestingLocation : NearbyBookstoresUiState
    data object Loading : NearbyBookstoresUiState
    data class Success(
        val places: List<NearbyBookstoreDto>,
        val radius: Int,
    ) : NearbyBookstoresUiState
    data object Empty : NearbyBookstoresUiState
    data class Error(val message: String) : NearbyBookstoresUiState
}
```

El ViewModel debe exponer funciones equivalentes a:

```kotlin
fun searchNearby(radius: Int = 20_000)
fun retry()
fun clearError()
```

Evitar guardar una referencia a `Activity`, `Context` o `FusedLocationProviderClient` dentro del ViewModel si la arquitectura existente separa la obtención de ubicación mediante una interfaz.

## Interfaz Compose

Agregar la sección al detalle del tomo, debajo de sus acciones principales.

Contenido esperado:

- Título: `¿Dónde comprar este tomo?`
- Aviso: `Comiku no conoce la disponibilidad de este tomo. Consulta el stock directamente con el comercio.`
- Botón inicial: `Buscar cerca mío`
- Control segmentado para `20 km` y `50 km` después de la primera búsqueda.
- Indicador de carga sin modificar el tamaño del contenedor.
- Lista con nombre, dirección, tipo y distancia.
- Botones `Ver en Google Maps` y `Cómo llegar`.
- Mensaje vacío con opción de ampliar a 50 km.
- Mensaje específico cuando se rechaza el permiso de ubicación.

No mostrar un mapa embebido en Android para esta primera versión.

## Formato de distancia

```kotlin
fun formatDistance(distanceMeters: Int): String {
    return if (distanceMeters < 1_000) {
        "$distanceMeters m"
    } else {
        String.format(Locale("es", "AR"), "%.1f km", distanceMeters / 1_000.0)
    }
}
```

No volver a ordenar por texto. El backend ya devuelve los comercios ordenados por distancia.

## Abrir Google Maps

Para ver el comercio, usar primero `googleMapsUrl` recibido del backend:

```kotlin
fun openPlace(context: Context, place: NearbyBookstoreDto) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(place.googleMapsUrl))
    context.startActivity(intent)
}
```

Para indicaciones:

```kotlin
fun openDirections(context: Context, place: NearbyBookstoreDto) {
    val url = buildString {
        append("https://www.google.com/maps/dir/?api=1")
        append("&destination=")
        append(place.latitude)
        append(",")
        append(place.longitude)
        append("&destination_place_id=")
        append(Uri.encode(place.id))
    }

    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}
```

Maps URLs no requieren API key. Android resolverá la URL con Google Maps si está disponible o con un navegador compatible.

Comprobar `resolveActivity` y mostrar un mensaje si no existe ninguna aplicación capaz de abrir el enlace.

## URL del backend durante desarrollo

No usar `localhost` desde Android porque apuntaría al propio dispositivo.

- Emulador Android: `http://10.0.2.2:3000/`
- Dispositivo físico: `http://IP_LOCAL_DE_LA_COMPUTADORA:3000/`
- Entorno remoto: URL HTTPS pública del backend.

Para HTTP local puede ser necesario permitir tráfico no cifrado solo en la configuración de depuración. No habilitar HTTP globalmente para una versión distribuida.

El teléfono y la computadora deben estar en la misma red para probar con una IP local. El backend también debe aceptar conexiones desde la red y el firewall de Windows debe permitir el puerto correspondiente.

## Manejo de errores

Mostrar mensajes comprensibles para:

- Usuario sin sesión.
- Permiso de ubicación rechazado.
- Ubicación desactivada o no disponible.
- Tiempo de espera agotado.
- Backend inaccesible.
- Token vencido.
- Sin resultados en 20 km.
- Sin resultados en 50 km.
- Servicio de Google temporalmente no disponible.

No mostrar excepciones técnicas, cuerpos HTTP completos, tokens ni claves.

## Seguridad y privacidad

- No agregar `GOOGLE_MAPS_DEMO_API_KEY` al proyecto Android.
- No llamar a Places API desde Android.
- No registrar Firebase ID Tokens en Logcat.
- No persistir la ubicación del usuario.
- No escribir búsquedas ni resultados en Firestore.
- No afirmar que un comercio tiene stock del tomo.
- Mantener el endpoint autenticado.

## Pruebas mínimas

1. Usuario autenticado con permiso preciso.
2. Usuario autenticado con permiso aproximado.
3. Permiso rechazado temporalmente.
4. Permiso rechazado permanentemente con acceso a ajustes.
5. Ubicación desactivada.
6. Resultados dentro de 20 km.
7. Ampliación a 50 km.
8. Lista vacía.
9. Token vencido.
10. Backend detenido.
11. Apertura de un comercio en Google Maps.
12. Apertura de indicaciones sin Google Maps instalado.
13. Rotación o recreación de la pantalla sin repetir búsquedas automáticamente.

## Criterios de aceptación

- La clave de Maps solo existe en el backend y en el frontend web actual.
- Android consume `POST /api/places/nearby-bookstores` con Firebase ID Token.
- La ubicación se solicita únicamente por acción del usuario.
- Los radios disponibles son 20 km y 50 km.
- Los resultados muestran nombre, dirección y distancia.
- Los enlaces externos funcionan sin Maps SDK for Android.
- Los estados de carga, vacío y error son visibles y accesibles.
- No se guarda información en Firestore.
- La pantalla sigue el diseño y los componentes existentes del proyecto Android.

## Prompt listo para Copilot Android

Usar este texto al iniciar la implementación en el repositorio Android:

```text
Implementa en el detalle de un tomo la función ¿Dónde comprar este tomo? siguiendo íntegramente docs/ANDROID_COMERCIOS_CERCANOS.md.

Antes de editar, revisa la arquitectura, navegación, cliente HTTP, autenticación Firebase, manejo de permisos, componentes visuales y pruebas ya existentes. Reutiliza esos patrones en lugar de crear una arquitectura paralela.

La aplicación debe obtener la ubicación únicamente después de pulsar Buscar cerca mío, consumir POST /api/places/nearby-bookstores con el Firebase ID Token y mostrar una lista con radios de 20 km y 50 km. No agregues Maps SDK, no incluyas ninguna Google Maps API key y no escribas datos en Firestore. Abre los comercios y las indicaciones mediante Google Maps URLs.

Implementa modelos, servicio de red, repositorio, ViewModel, estados de UI, permisos, pantalla Compose y pruebas focalizadas. Valida compilación, lint y pruebas al finalizar. No modifiques funcionalidades no relacionadas.
```