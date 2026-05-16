export async function createCroppedImageDataUrl(imageSrc, croppedAreaPixels, { mimeType = 'image/jpeg', quality = 0.92 } = {}) {
  if (typeof imageSrc !== 'string' || !imageSrc) {
    throw new Error('No se pudo recortar la imagen seleccionada.')
  }

  if (!croppedAreaPixels) {
    throw new Error('No se pudo calcular el área de recorte.')
  }

  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')

  canvas.width = Math.max(1, Math.round(croppedAreaPixels.width))
  canvas.height = Math.max(1, Math.round(croppedAreaPixels.height))

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No se pudo preparar el recorte de la imagen.')
  }

  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  if (mimeType === 'image/png') {
    return canvas.toDataURL(mimeType)
  }

  return canvas.toDataURL(mimeType, quality)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo cargar la imagen para recortarla.'))
    image.src = src
  })
}