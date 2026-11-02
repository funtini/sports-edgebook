import { fitWithin } from '@/domain/slipLegEdit'

/** Image types the import takes (docs/specs/slip-import.md#flow). */
export const SLIP_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const JPEG_QUALITY = 0.85

export interface PreparedSlipImage {
  /** Base64 JPEG, without a `data:` prefix, as `read-slip` takes it. */
  base64: string
  /** Object URL of the JPEG, for the window; revoke it when the import ends. */
  url: string
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image could not be decoded'))
    }
    image.src = url
  })
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * The image shrunk to at most 1600px on its long side and re-encoded as JPEG, in the browser.
 * It never leaves the browser except for the read itself.
 */
export async function prepareSlipImage(file: Blob): Promise<PreparedSlipImage> {
  const image = await loadImage(file)
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas is not available')
  // JPEG has no transparency: a transparent PNG would turn black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('image could not be encoded'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  )
  return { base64: await toBase64(blob), url: URL.createObjectURL(blob) }
}
