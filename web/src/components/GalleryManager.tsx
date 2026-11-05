import {
  ActionIcon,
  Anchor,
  AspectRatio,
  Badge,
  Box,
  Button,
  FileButton,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type GalleryPhoto,
  type GalleryUpload,
  galleryErrorMessage,
  galleryImageTypes,
  maxCaptionLength,
  maxGalleryPhotos,
  useDeleteGalleryPhoto,
  useGallery,
  useGalleryUploads,
  useReorderGallery,
  useUpdateGalleryCaption,
} from '../api/gallery.ts'
import { ErrorAlert } from './ErrorAlert.tsx'
import { ChevronLeftIcon, ChevronRightIcon, GripIcon, TrashIcon } from './icons.tsx'

/** A photo being dragged by its handle, and the order it would have if it were dropped now. */
type Drag = { id: string; pointerId: number; order: string[] }

/** Which move button to focus again after the photo moved, because the tile changes its place in the page. */
type MoveFocus = { id: string; direction: -1 | 1 }

/**
 * The photo gallery of the branding page: drop or choose several photos at once (uploaded one after another, each with its
 * progress and its own error), and the photos as 4:3 tiles in their order. A tile is moved by dragging its handle (mouse,
 * pen and touch, with pointer events as in the floor plan editor) or with "Move forward" and "Move back"; the new order
 * is saved right away. The caption is edited in the tile and saved when leaving the field or with Enter; deleting asks first.
 */
export function GalleryManager({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const gallery = useGallery()
  const reorder = useReorderGallery()
  const deletePhoto = useDeleteGalleryPhoto()
  const { uploads, add, clearFinished } = useGalleryUploads()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [deleting, setDeleting] = useState<GalleryPhoto | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const resetFileButton = useRef<() => void>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const moveFocus = useRef<MoveFocus | null>(null)

  const photos = gallery.data ?? []

  useEffect(() => {
    const focus = moveFocus.current
    if (focus === null || gridRef.current === null) {
      return
    }
    moveFocus.current = null
    const button = (direction: -1 | 1) => gridRef.current?.querySelector<HTMLButtonElement>(`[data-move="${focus.id}:${direction}"]`)
    const target = button(focus.direction)
    // At the start or the end the button is disabled, so the other one takes the focus.
    ;(target === null || target === undefined || target.disabled ? button(-focus.direction as -1 | 1) : target)?.focus()
  }, [gallery.data])

  function saveOrder(order: string[]) {
    reorder.mutate(order, {
      onError: (error) => notifications.show({ color: 'red', title: t('branding.gallery.orderError'), message: galleryErrorMessage(error, t) }),
    })
  }

  function move(index: number, direction: -1 | 1) {
    const order = photos.map((photo) => photo.id)
    const [id] = order.splice(index, 1)
    order.splice(index + direction, 0, id)
    moveFocus.current = { id, direction }
    saveOrder(order)
  }

  function startDrag(event: PointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ id, pointerId: event.pointerId, order: photos.map((photo) => photo.id) })
  }

  function handleDragMove(event: PointerEvent<HTMLElement>) {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return
    }
    // The tile under the pointer takes the dragged photo's place; the others move up or down by one.
    const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-gallery-photo]')
    const targetId = tile?.dataset.galleryPhoto
    if (targetId === undefined || targetId === drag.id) {
      return
    }
    const order = drag.order.filter((id) => id !== drag.id)
    order.splice(drag.order.indexOf(targetId), 0, drag.id)
    setDrag({ ...drag, order })
  }

  function endDrag(event: PointerEvent<HTMLElement>, drop: boolean) {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return
    }
    setDrag(null)
    if (drop && drag.order.some((id, index) => photos[index]?.id !== id)) {
      saveOrder(drag.order)
    }
  }

  if (gallery.isPending) {
    return <Skeleton h={240} radius="md" />
  }
  if (gallery.isError) {
    return <ErrorAlert error={gallery.error} onRetry={() => void gallery.refetch()} />
  }

  // While dragging, the tiles keep their place in the page and only show in the new order (CSS order), so the handle
  // keeps the pointer; the gallery itself takes the new order when the photo is dropped.
  const positionOf = (photo: GalleryPhoto, index: number) => (drag === null ? index : drag.order.indexOf(photo.id))
  const full = photos.length >= maxGalleryPhotos
  const busy = uploads.some((upload) => upload.status === 'waiting' || upload.status === 'uploading')

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Group justify="space-between" align="center" gap="xs">
          <Title order={3}>{t('branding.gallery.title')}</Title>
          <Badge variant="light" color={full ? 'orange' : 'brand'}>
            {t('branding.gallery.count', { count: photos.length, max: maxGalleryPhotos })}
          </Badge>
        </Group>
        <Text c="dimmed" size="sm">
          {t('branding.gallery.hint')}
        </Text>
        <Anchor href={`/r/${slug}`} target="_blank" rel="noopener" size="sm">
          {t('branding.gallery.viewOnBookingPage')}
        </Anchor>
      </Stack>

      <Paper
        p="md"
        radius="md"
        bg={dragOver ? 'brand.0' : 'gray.0'}
        style={{ border: `2px dashed var(--mantine-color-${dragOver ? 'brand-6' : 'gray-4'})` }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length > 0) {
            add(files)
          }
        }}
      >
        <Stack align="center" gap="sm" py={photos.length === 0 ? 'lg' : 'xs'}>
          {photos.length === 0 && <Title order={4}>{t('branding.gallery.emptyTitle')}</Title>}
          <Text c="dimmed" ta="center" size="sm" maw={460}>
            {full ? t('branding.gallery.fullHint', { max: maxGalleryPhotos }) : photos.length === 0 ? t('branding.gallery.emptyText') : t('branding.gallery.dropHint')}
          </Text>
          <FileButton
            multiple
            accept={galleryImageTypes.join(',')}
            resetRef={resetFileButton}
            onChange={(files) => {
              if (files.length > 0) {
                add(files)
              }
              resetFileButton.current?.()
            }}
          >
            {(props) => (
              <Button {...props} variant={photos.length === 0 ? 'filled' : 'default'} disabled={full}>
                {t('branding.gallery.choose')}
              </Button>
            )}
          </FileButton>
        </Stack>
      </Paper>

      {uploads.length > 0 && (
        <Stack gap="xs" aria-live="polite">
          {uploads.map((upload) => (
            <UploadRow key={upload.key} upload={upload} />
          ))}
          {!busy && (
            <Group>
              <Button variant="subtle" size="xs" onClick={clearFinished}>
                {t('branding.gallery.upload.clear')}
              </Button>
            </Group>
          )}
        </Stack>
      )}

      {photos.length > 0 && (
        <Stack gap="xs">
          <Text c="dimmed" size="xs">
            {t('branding.gallery.sortHint')}
          </Text>
          <SimpleGrid ref={gridRef} cols={{ base: 1, xs: 2, lg: 3 }} spacing="sm">
            {photos.map((photo, index) => (
              <GalleryTile
                key={photo.id}
                photo={photo}
                position={positionOf(photo, index)}
                count={photos.length}
                dragging={drag?.id === photo.id}
                onDragStart={(event) => startDrag(event, photo.id)}
                onDragMove={handleDragMove}
                onDragEnd={endDrag}
                onMove={(direction) => move(index, direction)}
                onDelete={() => setDeleting(photo)}
              />
            ))}
          </SimpleGrid>
        </Stack>
      )}

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title={t('branding.gallery.deleteTitle')}>
        {deleting !== null && (
          <Stack gap="md">
            <AspectRatio ratio={4 / 3} maw={240}>
              <Image src={deleting.url} alt={deleting.caption ?? ''} radius="sm" fit="cover" />
            </AspectRatio>
            <Text size="sm">{t('branding.gallery.deleteText')}</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                color="red"
                loading={deletePhoto.isPending}
                onClick={() =>
                  deletePhoto.mutate(deleting.id, {
                    onSuccess: () => {
                      setDeleting(null)
                      notifications.show({ color: 'green', message: t('branding.gallery.deleted') })
                    },
                    onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: galleryErrorMessage(error, t) }),
                  })
                }
              >
                {t('branding.gallery.deleteConfirm')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

/** A chosen file in the list of uploads: its name, and its progress, "Uploaded" or why it was not added. */
function UploadRow({ upload }: { upload: GalleryUpload }) {
  const { t } = useTranslation()

  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text size="sm" truncate miw={0}>
          {upload.file.name}
        </Text>
        <Text size="xs" c={upload.status === 'error' ? 'red' : upload.status === 'done' ? 'green' : 'dimmed'} ta="right" style={{ flexShrink: 0 }} maw="60%">
          {upload.status === 'waiting'
            ? t('branding.gallery.upload.waiting')
            : upload.status === 'uploading'
              ? t('branding.gallery.upload.uploading', { percent: Math.round(upload.progress * 100) })
              : upload.status === 'done'
                ? t('branding.gallery.upload.done')
                : galleryErrorMessage(upload.error, t)}
        </Text>
      </Group>
      {upload.status !== 'error' && (
        <Progress
          size="sm"
          value={upload.progress * 100}
          color={upload.status === 'done' ? 'green' : 'brand'}
          animated={upload.status === 'uploading'}
          aria-label={upload.file.name}
        />
      )}
    </Stack>
  )
}

type GalleryTileProps = {
  photo: GalleryPhoto
  /** Its place in the gallery as shown, from 0; the first one appears large in the guests' gallery. */
  position: number
  count: number
  dragging: boolean
  onDragStart: (event: PointerEvent<HTMLElement>) => void
  onDragMove: (event: PointerEvent<HTMLElement>) => void
  onDragEnd: (event: PointerEvent<HTMLElement>, drop: boolean) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}

/** A photo of the gallery: the image in 4:3 with the drag handle, the caption below it and the buttons to move and delete it. */
function GalleryTile({ photo, position, count, dragging, onDragStart, onDragMove, onDragEnd, onMove, onDelete }: GalleryTileProps) {
  const { t } = useTranslation()
  const updateCaption = useUpdateGalleryCaption()
  const [draft, setDraft] = useState(photo.caption ?? '')
  const [captionError, setCaptionError] = useState<string | null>(null)

  function saveCaption() {
    const caption = draft.trim()
    if (caption === (photo.caption ?? '')) {
      setDraft(caption)
      setCaptionError(null)
      return
    }
    updateCaption.mutate(
      { id: photo.id, caption },
      {
        onSuccess: (saved) => {
          setDraft(saved.caption ?? '')
          setCaptionError(null)
          notifications.show({ color: 'green', message: t('branding.gallery.captionSaved') })
        },
        onError: (error) => setCaptionError(galleryErrorMessage(error, t)),
      },
    )
  }

  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      data-gallery-photo={photo.id}
      style={{ order: position, ...(dragging ? { opacity: 0.6, outline: '2px solid var(--mantine-color-brand-6)', outlineOffset: 2 } : {}) }}
    >
      <Stack gap="xs">
        <Box pos="relative">
          <AspectRatio ratio={4 / 3}>
            <Image
              src={photo.url}
              alt={photo.caption ?? t('branding.gallery.photoAlt', { number: position + 1 })}
              radius="sm"
              fit="cover"
              draggable={false}
              loading="lazy"
            />
          </AspectRatio>
          {position === 0 && (
            <Badge pos="absolute" top={8} left={8} variant="filled" color="dark" size="sm" maw="calc(100% - 56px)">
              {t('branding.gallery.largeImage')}
            </Badge>
          )}
          <Tooltip label={t('branding.gallery.dragHandle')}>
            <ActionIcon
              component="span"
              aria-hidden
              pos="absolute"
              top={6}
              right={6}
              size="lg"
              variant="white"
              color="dark"
              style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={(event) => onDragEnd(event, true)}
              onPointerCancel={(event) => onDragEnd(event, false)}
            >
              <GripIcon />
            </ActionIcon>
          </Tooltip>
        </Box>
        <TextInput
          size="sm"
          aria-label={t('branding.gallery.caption')}
          placeholder={t('branding.gallery.captionPlaceholder')}
          value={draft}
          maxLength={maxCaptionLength}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={saveCaption}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          rightSection={updateCaption.isPending ? <Loader size="xs" /> : undefined}
          description={t('branding.gallery.captionCount', { count: draft.length, max: maxCaptionLength })}
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          error={captionError}
        />
        <Group justify="space-between" gap="xs">
          <Group gap={4}>
            <Tooltip label={t('branding.gallery.moveForward')}>
              <ActionIcon variant="default" data-move={`${photo.id}:-1`} disabled={position === 0} onClick={() => onMove(-1)} aria-label={t('branding.gallery.moveForward')}>
                <ChevronLeftIcon size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('branding.gallery.moveBack')}>
              <ActionIcon variant="default" data-move={`${photo.id}:1`} disabled={position === count - 1} onClick={() => onMove(1)} aria-label={t('branding.gallery.moveBack')}>
                <ChevronRightIcon size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Tooltip label={t('branding.gallery.delete')}>
            <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label={t('branding.gallery.delete')}>
              <TrashIcon size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </Paper>
  )
}
