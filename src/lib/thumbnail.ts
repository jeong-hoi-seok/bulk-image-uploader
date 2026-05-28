/**
 * Canvas를 이용해 이미지 파일을 저해상도 썸네일 DataURL로 변환합니다.
 * 원본 objectURL 대비 용량이 훨씬 작아 메모리 효율적입니다.
 *
 * @param file  - 원본 이미지 File
 * @param maxSize - 가로/세로 최대 픽셀 (기본 80px)
 * @param quality - JPEG 품질 0~1 (기본 0.5)
 */
export function createThumbnail(
  file: File,
  maxSize = 80,
  quality = 0.5,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()

    img.onload = () => {
      URL.revokeObjectURL(url) // 원본 objectURL 즉시 해제

      const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('썸네일 생성 실패'))
    }

    img.src = url
  })
}
