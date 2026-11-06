import { Button, Card, Center, Divider, FileButton, Grid, Group, Loader, Modal, Stack, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type Area,
  floorPlanTypes,
  maxFloorPlanBytes,
  type Room,
  type RoomElement,
  type RoomElementKind,
  type Table,
  type TablePosition,
  useAreas,
  useCreateArea,
  useCreateTable,
  useReorderAreas,
  useRoom,
  useSaveRoom,
  useSaveTablePositions,
  useSuggestRoom,
  useTables,
  useUploadFloorPlan,
} from '../api/areas.ts'
import { errorMessage } from '../api/areaErrors.ts'
import { AreaPanel } from '../components/AreaPanel.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { roomElementDimensions, roomElementSize } from '../components/floor-plan/layout.ts'
import { FloorPlanCanvas } from '../components/FloorPlanCanvas.tsx'
import { FloorPlanDropzone } from '../components/FloorPlanDropzone.tsx'
import { RoomElementPanel } from '../components/RoomElementPanel.tsx'
import { RoomPanel } from '../components/RoomPanel.tsx'
import { TablePanel } from '../components/TablePanel.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

/** Wait this long after the last move before saving, so several moves go into one request. */
const savePositionsDelay = 800

/** Seats of a new table; the admin changes them in the table's properties. */
const newTableSeats = 4

/**
 * Moved tables keep their new position here until it is saved. The positions of all moves within
 * a short time are saved in one request, and whatever is still unsaved when the page is left as well.
 */
function usePendingPositions() {
  const { t } = useTranslation()
  const { mutate } = useSaveTablePositions()
  const [pending, setPending] = useState<Record<string, TablePosition>>({})
  const pendingRef = useRef(pending)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const save = useCallback(() => {
    const positions = Object.values(pendingRef.current)
    if (positions.length === 0) {
      return
    }
    // A position that was moved again in the meantime stays pending and is saved next.
    const done = () =>
      setPending((current) => {
        const next = { ...current }
        for (const position of positions) {
          if (next[position.id] === position) {
            delete next[position.id]
          }
        }
        return next
      })
    mutate(positions, {
      onSuccess: done,
      onError: (error) => {
        done()
        notifications.show({ color: 'red', title: t('areas.errors.positionsNotSaved'), message: errorMessage(error, t) })
      },
    })
  }, [mutate, t])

  useEffect(() => {
    if (Object.keys(pending).length === 0) {
      return
    }
    const timer = window.setTimeout(save, savePositionsDelay)
    return () => window.clearTimeout(timer)
  }, [pending, save])

  // Saves what is still pending when the page is left.
  useEffect(() => () => save(), [save])

  const move = useCallback((id: string, posX: number, posY: number) => {
    setPending((current) => ({ ...current, [id]: { id, posX, posY } }))
  }, [])

  /** Drops the unsaved positions of these tables, e.g. after they were arranged anew. */
  const discard = useCallback((ids: string[]) => {
    setPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))))
  }, [])

  return { pending, move, discard }
}

/**
 * The edited rooms keep their changes here until they are saved, like the table positions: all changes of a room within
 * a short time go into one request (the whole room), and whatever is still unsaved when the page is left as well.
 */
function usePendingRooms() {
  const { t } = useTranslation()
  const { mutateAsync, isPending } = useSaveRoom()
  const [pending, setPending] = useState<Record<string, Room>>({})
  const pendingRef = useRef(pending)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  /** Saves every pending room; a failed one is dropped (the plan shows the saved room again) and reported. */
  const save = useCallback(async () => {
    await Promise.all(
      Object.entries(pendingRef.current).map(async ([areaId, room]) => {
        // A room that was changed again in the meantime stays pending and is saved next.
        const done = () =>
          setPending((current) => {
            if (current[areaId] !== room) {
              return current
            }
            const next = { ...current }
            delete next[areaId]
            return next
          })
        try {
          await mutateAsync({ areaId, room })
        } catch (error) {
          notifications.show({ color: 'red', title: t('areas.errors.roomNotSaved'), message: errorMessage(error, t) })
        }
        done()
      }),
    )
  }, [mutateAsync, t])

  useEffect(() => {
    if (Object.keys(pending).length === 0) {
      return
    }
    const timer = window.setTimeout(() => void save(), savePositionsDelay)
    return () => window.clearTimeout(timer)
  }, [pending, save])

  // Saves what is still pending when the page is left.
  useEffect(() => () => void save(), [save])

  /** Changes the room of the area, starting from its pending or else its saved state. */
  const edit = useCallback((areaId: string, saved: Room, change: (room: Room) => Room) => {
    setPending((current) => ({ ...current, [areaId]: change(current[areaId] ?? saved) }))
  }, [])

  const discard = useCallback((areaId: string) => {
    setPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== areaId)))
  }, [])

  return { pending, saving: isPending, save, edit, discard }
}

/** A new room element of its default size in the middle of the room, where the admin then drags it. */
function newElement(kind: RoomElementKind, label: string | null): RoomElement {
  const { length, depth } = roomElementDimensions[kind]
  return { id: crypto.randomUUID(), kind, posX: 0.5, posY: 0.5, rotation: 0, label, ...roomElementSize(length, depth, 0) }
}

/** Shape and rotation of the selected table as chosen in its panel, before they are saved. */
type TablePreview = Pick<Table, 'id' | 'shape' | 'rotation'>

/** The next free table number: one more than the highest numeric table number of the restaurant. */
function nextTableNumber(tables: Table[]) {
  const numbers = tables.map((table) => Number(table.number)).filter((number) => Number.isInteger(number))
  return String(Math.max(0, ...numbers) + 1)
}

/**
 * Areas & tables: areas as tabs, the plan with its tables, and a panel with the selected table, room element or area.
 * An area without floor plan image is a drawn room: its tables stand in it, the panel "Room" sets its style and adds
 * elements, which are moved like the tables; an image can be uploaded below it.
 * Shape and rotation of the selected table and the area's table size show in the plan before they are saved.
 */
export function AreasPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.nav.areas'))
  const areas = useAreas()
  const tables = useTables()
  const createTable = useCreateTable()
  const uploadFloorPlan = useUploadFloorPlan()
  const reorderAreas = useReorderAreas()
  const { pending, move, discard } = usePendingPositions()
  const pendingRooms = usePendingRooms()
  const suggestRoom = useSuggestRoom()
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  // The room of the shown area, only without floor plan image (the image shows the room).
  const shownArea = areas.data?.find((a) => a.id === selectedAreaId) ?? areas.data?.[0]
  const roomAreaId = shownArea !== undefined && shownArea.floorPlanUrl === null ? shownArea.id : null
  const savedRoom = useRoom(roomAreaId)
  // Not yet saved values of the panel, shown in the plan.
  const [tablePreview, setTablePreview] = useState<TablePreview | null>(null)
  const [scalePreview, setScalePreview] = useState<{ tableScale: number; widthMeters: number | null } | null>(null)
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure()

  if (areas.isPending || tables.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }

  if (areas.isError || tables.isError) {
    return (
      <ErrorAlert
        error={(areas.error ?? tables.error)!}
        onRetry={() => {
          void areas.refetch()
          void tables.refetch()
        }}
      />
    )
  }

  const area = areas.data.find((a) => a.id === selectedAreaId) ?? areas.data[0]
  const areaTables = area === undefined
    ? []
    : tables.data
        .filter((table) => table.areaId === area.id)
        .map((table) => ({ ...table, ...pending[table.id], ...(tablePreview?.id === table.id ? tablePreview : undefined) }))
  const selectedTable = areaTables.find((table) => table.id === selectedTableId)
  const room = roomAreaId === null ? undefined : (pendingRooms.pending[roomAreaId] ?? savedRoom.data)
  const selectedElement = room?.elements.find((element) => element.id === selectedElementId)

  function selectArea(areaId: string | null) {
    setSelectedAreaId(areaId)
    setSelectedTableId(null)
    setSelectedElementId(null)
    setTablePreview(null)
    setScalePreview(null)
  }

  /** Selecting a table shows its panel instead of the area's, so an unsaved table size is dropped. */
  function selectTable(tableId: string | null) {
    setSelectedElementId(null)
    if (tableId === selectedTableId) {
      return
    }
    setSelectedTableId(tableId)
    setTablePreview(null)
    if (tableId !== null) {
      setScalePreview(null)
    }
  }

  /** Selecting a room element shows its panel instead of the table's or the area's. */
  function selectElement(elementId: string) {
    selectTable(null)
    setSelectedElementId(elementId)
    setScalePreview(null)
  }

  /** Changes the room of the shown area; it is saved shortly after. */
  function editRoom(change: (room: Room) => Room) {
    if (roomAreaId !== null && savedRoom.data !== undefined) {
      pendingRooms.edit(roomAreaId, savedRoom.data, change)
    }
  }

  function changeElement(element: RoomElement) {
    editRoom((current) => ({ ...current, elements: current.elements.map((e) => (e.id === element.id ? element : e)) }))
  }

  function addElement(kind: RoomElementKind) {
    const element = newElement(kind, kind === 'Label' ? t('areas.room.defaultLabel') : null)
    editRoom((current) => ({ ...current, elements: [...current.elements, element] }))
    selectElement(element.id)
  }

  /** Saves the pending room first, so the suggestion uses the chosen style; then replaces elements and table positions. */
  async function suggest(area: Area) {
    await pendingRooms.save()
    try {
      await suggestRoom.mutateAsync(area.id)
      pendingRooms.discard(area.id)
      discard(areaTables.map((table) => table.id))
      setSelectedElementId(null)
      notifications.show({ color: 'brand', message: t('areas.room.suggested') })
    } catch (error) {
      notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) })
    }
  }

  function upload(area: Area, file: File) {
    if (!floorPlanTypes.includes(file.type)) {
      notifications.show({ color: 'red', title: t('errors.title'), message: t('areas.errors.floorPlanTypeInvalid') })
      return
    }
    if (file.size > maxFloorPlanBytes) {
      notifications.show({ color: 'red', title: t('errors.title'), message: t('areas.errors.floorPlanTooLarge') })
      return
    }
    uploadFloorPlan.mutate(
      { areaId: area.id, file },
      { onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }) },
    )
  }

  function addTable(area: Area) {
    createTable.mutate(
      { areaId: area.id, number: nextTableNumber(tables.data ?? []), seats: newTableSeats },
      {
        onSuccess: (table) => selectTable(table.id),
        onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
      },
    )
  }

  function moveArea(area: Area, direction: -1 | 1) {
    const ids = areas.data!.map((a) => a.id)
    const index = ids.indexOf(area.id)
    ;[ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]
    reorderAreas.mutate(ids, {
      onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
    })
  }

  const areaIndex = area === undefined ? -1 : areas.data.indexOf(area)
  const seats = areaTables.reduce((sum, table) => sum + table.seats, 0)

  return (
    <Stack gap="lg">
      <PageHeader
        title={t('admin.nav.areas')}
        description={t('areas.subtitle')}
        action={<Button onClick={openCreate}>{t('areas.addArea')}</Button>}
      />

      {area === undefined ? (
        <Card>
          <Stack align="center" gap="sm" py="xl">
            <Title order={4}>{t('areas.emptyTitle')}</Title>
            <Text c="dimmed" ta="center">
              {t('areas.emptyText')}
            </Text>
            <Button onClick={openCreate}>{t('areas.addArea')}</Button>
          </Stack>
        </Card>
      ) : (
        <>
          <Tabs value={area.id} onChange={selectArea}>
            <Tabs.List>
              {areas.data.map((a) => (
                <Tabs.Tab key={a.id} value={a.id}>
                  {a.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>

          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 8, xl: 9 }}>
              <Card>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Button onClick={() => addTable(area)} loading={createTable.isPending}>
                      {t('areas.addTable')}
                    </Button>
                    {area.floorPlanUrl !== null && (
                      <FileButton onChange={(file) => file !== null && upload(area, file)} accept={floorPlanTypes.join(',')}>
                        {(props) => (
                          <Button {...props} variant="default" loading={uploadFloorPlan.isPending}>
                            {t('areas.floorPlan.replace')}
                          </Button>
                        )}
                      </FileButton>
                    )}
                  </Group>
                  <FloorPlanCanvas
                    key={area.id}
                    imageUrl={area.floorPlanUrl}
                    tableScale={scalePreview?.tableScale ?? area.tableScale}
                    widthMeters={scalePreview !== null ? scalePreview.widthMeters : area.widthMeters}
                    tables={areaTables}
                    selectedTableId={selectedTableId}
                    onSelect={selectTable}
                    onMove={move}
                    roomStyle={room?.roomStyle ?? area.roomStyle}
                    roomElements={room?.elements ?? []}
                    selectedElementId={selectedElementId}
                    onSelectElement={selectElement}
                    onMoveElement={(id, posX, posY) =>
                      editRoom((current) => ({
                        ...current,
                        elements: current.elements.map((e) => (e.id === id ? { ...e, posX, posY } : e)),
                      }))
                    }
                  />
                  <Text size="xs" c="dimmed">
                    {area.floorPlanUrl === null ? t('areas.roomDragHint') : `${t('areas.dragHint')} ${t('areas.newTableHint')}`}
                  </Text>
                  <Text fw={500}>
                    {area.onlineBookingEnabled
                      ? t('areas.capacity', {
                          seats,
                          online: Math.floor((seats * area.onlineCapacityPercent) / 100),
                          percent: area.onlineCapacityPercent,
                        })
                      : t('areas.capacityOnlineBlocked', { seats })}
                  </Text>
                  {roomAreaId !== null && (
                    <>
                      <Divider />
                      {savedRoom.isError ? (
                        <ErrorAlert error={savedRoom.error} onRetry={() => void savedRoom.refetch()} />
                      ) : room === undefined ? (
                        <Center py="md">
                          <Loader size="sm" />
                        </Center>
                      ) : (
                        <RoomPanel
                          areaName={area.name}
                          roomStyle={room.roomStyle}
                          elementCount={room.elements.length}
                          saving={pendingRooms.pending[area.id] !== undefined || pendingRooms.saving}
                          onStyleChange={(roomStyle) => editRoom((current) => ({ ...current, roomStyle }))}
                          onAdd={addElement}
                          onSuggest={() => suggest(area)}
                          suggesting={suggestRoom.isPending}
                        />
                      )}
                    </>
                  )}
                  {area.floorPlanUrl === null && (
                    <FloorPlanDropzone onFile={(file) => upload(area, file)} loading={uploadFloorPlan.isPending} />
                  )}
                </Stack>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4, xl: 3 }}>
              <Card>
                {selectedTable !== undefined ? (
                  <TablePanel
                    key={selectedTable.id}
                    table={selectedTable}
                    onPreview={(shape, rotation) => setTablePreview({ id: selectedTable.id, shape, rotation })}
                    onClose={() => selectTable(null)}
                  />
                ) : selectedElement !== undefined ? (
                  <RoomElementPanel
                    key={selectedElement.id}
                    element={selectedElement}
                    onChange={changeElement}
                    onDelete={() => {
                      editRoom((current) => ({ ...current, elements: current.elements.filter((e) => e.id !== selectedElement.id) }))
                      setSelectedElementId(null)
                    }}
                    onClose={() => setSelectedElementId(null)}
                  />
                ) : (
                  <AreaPanel
                    key={area.id}
                    area={area}
                    tableCount={areaTables.length}
                    canMoveLeft={areaIndex > 0}
                    canMoveRight={areaIndex < areas.data.length - 1}
                    onMove={(direction) => moveArea(area, direction)}
                    moving={reorderAreas.isPending}
                    onDeleted={() => selectArea(null)}
                    onPreviewChange={setScalePreview}
                    onArranged={() => discard(areaTables.map((table) => table.id))}
                  />
                )}
              </Card>
            </Grid.Col>
          </Grid>
        </>
      )}

      <CreateAreaModal opened={createOpened} onClose={closeCreate} onCreated={selectArea} />
    </Stack>
  )
}

type CreateAreaModalProps = {
  opened: boolean
  onClose: () => void
  onCreated: (areaId: string) => void
}

function CreateAreaModal({ opened, onClose, onCreated }: CreateAreaModalProps) {
  const { t } = useTranslation()
  const createArea = useCreateArea()
  const form = useForm({
    initialValues: { name: '' },
    validate: {
      name: (value) => {
        const name = value.trim()
        return name.length === 0 || name.length > 100 ? t('areas.errors.areaNameInvalid') : null
      },
    },
  })

  function close() {
    form.reset()
    onClose()
  }

  return (
    <Modal opened={opened} onClose={close} title={t('areas.addArea')}>
      <form
        onSubmit={form.onSubmit((values) =>
          createArea.mutate(values.name.trim(), {
            onSuccess: (area) => {
              onCreated(area.id)
              close()
            },
            onError: (error) => form.setFieldError('name', errorMessage(error, t)),
          }),
        )}
      >
        <Stack gap="md">
          <TextInput label={t('areas.area.name')} placeholder={t('areas.area.namePlaceholder')} maxLength={100} data-autofocus {...form.getInputProps('name')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createArea.isPending}>
              {t('areas.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
