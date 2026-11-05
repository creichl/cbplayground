import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useRef, useState } from 'react'
import { ApiError, apiDelete, apiGet, apiPostFile, apiPut, httpErrorMessage } from './client.ts'

/** A photo of the restaurant's gallery, as in GET /api/admin/gallery and `gallery` of the public restaurant; `caption` is null without one. */
export type GalleryPhoto = {
  id: string
  url: string
  caption: string | null
}

/** The limits of the API: photos per gallery, size of a photo, length of a caption, and the image types it accepts. */
export const maxGalleryPhotos = 20
export const maxGalleryPhotoBytes = 10 * 1024 * 1024
export const maxCaptionLength = 120
export const galleryImageTypes = ['image/png', 'image/jpeg', 'image/webp']

const galleryKey = ['admin', 'gallery'] as const

export function useGallery() {
  return useQuery({
    queryKey: galleryKey,
    queryFn: () => apiGet<GalleryPhoto[]>('/admin/gallery'),
  })
}

/** The booking page shows the gallery, so it is reloaded after every change. */
function useReloadPublic() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['public'] })
}

/** Changes the caption; an empty one removes it. */
export function useUpdateGalleryCaption() {
  const queryClient = useQueryClient()
  const reloadPublic = useReloadPublic()
  return useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string }) => apiPut<GalleryPhoto>(`/admin/gallery/${id}`, { caption }),
    onSuccess: async (photo) => {
      queryClient.setQueryData<GalleryPhoto[]>(galleryKey, (photos) => photos?.map((p) => (p.id === photo.id ? photo : p)))
      await reloadPublic()
    },
  })
}

export function useDeleteGalleryPhoto() {
  const queryClient = useQueryClient()
  const reloadPublic = useReloadPublic()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/gallery/${id}`),
    onSuccess: async (_, id) => {
      queryClient.setQueryData<GalleryPhoto[]>(galleryKey, (photos) => photos?.filter((p) => p.id !== id))
      await reloadPublic()
    },
  })
}

/**
 * Saves a new order (all photo ids). The gallery shows it right away; if saving fails, it goes back to the order before
 * and is reloaded from the server.
 */
export function useReorderGallery() {
  const queryClient = useQueryClient()
  const reloadPublic = useReloadPublic()
  return useMutation({
    mutationFn: (photoIds: string[]) => apiPut<GalleryPhoto[]>('/admin/gallery/order', { photoIds }),
    onMutate: async (photoIds) => {
      await queryClient.cancelQueries({ queryKey: galleryKey })
      const previous = queryClient.getQueryData<GalleryPhoto[]>(galleryKey)
      if (previous !== undefined) {
        const byId = new Map(previous.map((photo) => [photo.id, photo]))
        queryClient.setQueryData<GalleryPhoto[]>(
          galleryKey,
          photoIds.flatMap((id) => byId.get(id) ?? []),
        )
      }
      return { previous }
    },
    onError: async (_error, _photoIds, result) => {
      if (result?.previous !== undefined) {
        queryClient.setQueryData(galleryKey, result.previous)
      }
      await queryClient.invalidateQueries({ queryKey: galleryKey })
    },
    onSuccess: async (photos) => {
      queryClient.setQueryData(galleryKey, photos)
      await reloadPublic()
    },
  })
}

/**
 * A file chosen for the gallery. `progress` is the share sent, 0–1. `error` is the reason it was not added: an ApiError
 * of the upload, or the error code of the API for a file that was not sent because it breaks the same rule
 * ("gallery_full", "floor_plan_too_large", "floor_plan_type_invalid"); see galleryErrorMessage.
 */
export type GalleryUpload = {
  key: number
  file: File
  status: 'waiting' | 'uploading' | 'done' | 'error'
  progress: number
  error: unknown
}

/**
 * Uploads chosen files to the gallery one after another, each with its progress and its own error, while the others go on.
 * A file that is not a PNG, JPEG or WebP image or is larger than 10 MB is not sent; once the gallery holds 20 photos, the
 * remaining files are rejected with "gallery_full". Every uploaded photo appears in the gallery right away.
 */
export function useGalleryUploads() {
  const queryClient = useQueryClient()
  const reloadPublic = useReloadPublic()
  const [uploads, setUploads] = useState<GalleryUpload[]>([])
  const queue = useRef<GalleryUpload[]>([])
  const running = useRef(false)
  const nextKey = useRef(0)

  function update(key: number, change: Partial<GalleryUpload>) {
    setUploads((list) => list.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)))
  }

  async function run() {
    running.current = true
    // Set when the server answers "gallery_full" although the list showed room, e.g. after an upload in another tab.
    let full = false
    for (let upload = queue.current.shift(); upload !== undefined; upload = queue.current.shift()) {
      const { key, file } = upload
      const count = queryClient.getQueryData<GalleryPhoto[]>(galleryKey)?.length ?? 0
      const rejection =
        full || count >= maxGalleryPhotos
          ? 'gallery_full'
          : !galleryImageTypes.includes(file.type)
            ? 'floor_plan_type_invalid'
            : file.size > maxGalleryPhotoBytes
              ? 'floor_plan_too_large'
              : null
      if (rejection !== null) {
        update(key, { status: 'error', error: rejection })
        continue
      }

      update(key, { status: 'uploading' })
      try {
        const photo = await apiPostFile<GalleryPhoto>('/admin/gallery', file, (progress) => update(key, { progress }))
        queryClient.setQueryData<GalleryPhoto[]>(galleryKey, (photos) => [...(photos ?? []), photo])
        update(key, { status: 'done', progress: 1 })
      } catch (error) {
        update(key, { status: 'error', error })
        if (error instanceof ApiError && error.code === 'gallery_full') {
          full = true
        }
      }
    }
    running.current = false
    await Promise.all([queryClient.invalidateQueries({ queryKey: galleryKey }), reloadPublic()])
  }

  /** Adds the files to the end of the queue and starts it, unless it is running. */
  function add(files: File[]) {
    const added = files.map((file): GalleryUpload => ({ key: nextKey.current++, file, status: 'waiting', progress: 0, error: null }))
    setUploads((list) => [...list, ...added])
    queue.current.push(...added)
    if (!running.current) {
      void run()
    }
  }

  /** Removes the finished files (uploaded or failed) from the list. */
  function clearFinished() {
    setUploads((list) => list.filter((upload) => upload.status === 'waiting' || upload.status === 'uploading'))
  }

  return { uploads, add, clearFinished }
}

/** Error codes of the gallery endpoints and their texts; the photos share the size limit and its code with the floor plans. */
const errorKeys = {
  gallery_full: 'branding.gallery.errors.galleryFull',
  invalid_caption: 'branding.gallery.errors.invalidCaption',
  invalid_order: 'branding.gallery.errors.invalidOrder',
  floor_plan_too_large: 'branding.gallery.errors.tooLarge',
  floor_plan_type_invalid: 'branding.gallery.errors.typeInvalid',
} as const

/** A failed request of the gallery, or a file rejected before upload (see GalleryUpload), in the user's language. */
export function galleryErrorMessage(error: unknown, t: TFunction) {
  if (typeof error === 'string' && error in errorKeys) {
    return t(errorKeys[error as keyof typeof errorKeys])
  }
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in errorKeys) {
      return t(errorKeys[error.code as keyof typeof errorKeys])
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}
