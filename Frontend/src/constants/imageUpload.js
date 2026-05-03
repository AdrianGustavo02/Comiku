// Constantes para validación de carga de imágenes

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
