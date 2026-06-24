//Validación de carga de imágenes

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export const MAX_COVER_SIZE_BYTES = 500 * 1024 // 500 KB
export const MAX_PROFILE_PICTURE_SIZE_BYTES = 500 * 1024 // 500 KB

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer la imagen seleccionada.'))
        return
      }

      resolve(reader.result)
    }

    reader.onerror = () => {
      reject(new Error('No se pudo leer la imagen seleccionada.'))
    }

    reader.readAsDataURL(file)
  })
}

export function createThumbnailFromDataUrl(dataUrl, { maxWidth = 320, maxHeight = 480, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl)
      return
    }

    const image = new Image()

    image.onload = () => {
      try {
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
        const targetWidth = Math.max(1, Math.round(image.width * scale))
        const targetHeight = Math.max(1, Math.round(image.height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight

        const context = canvas.getContext('2d')

        if (!context) {
          resolve(dataUrl)
          return
        }

        context.drawImage(image, 0, 0, targetWidth, targetHeight)

        const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

        if (mimeType === 'image/png') {
          resolve(canvas.toDataURL(mimeType))
          return
        }

        resolve(canvas.toDataURL(mimeType, quality))
      } catch (error) {
        reject(error)
      }
    }

    image.onerror = () => {
      reject(new Error('No se pudo generar la miniatura de la portada.'))
    }

    image.src = dataUrl
  })
}

export async function createCompressedImageDataUrl(
  dataUrl,
  { maxWidth = 240, maxHeight = 240, maxBytes = 80 * 1024, minQuality = 0.45 } = {},
) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return dataUrl
  }

  const image = new Image()

  await new Promise((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('No se pudo comprimir la imagen seleccionada.'))
    image.src = dataUrl
  })

  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  const targetWidth = Math.max(1, Math.round(image.width * scale))
  const targetHeight = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    return dataUrl
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  let quality = 0.82
  let compressedDataUrl = canvas.toDataURL('image/jpeg', quality)

  while (compressedDataUrl.length > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, Number((quality - 0.12).toFixed(2)))
    compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  return compressedDataUrl.length > maxBytes ? compressedDataUrl : compressedDataUrl
}
