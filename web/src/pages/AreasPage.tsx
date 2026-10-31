import { Button, Card, Center, FileButton, Grid, Group, Loader, Modal, Stack, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type Area,
  floorPlanTypes,
  maxFloorPlanBytes,
  type Table,
  type TablePosition,
  useAreas,
  useCreateArea,
  useCreateTable,
  useReorderAreas,
  useSaveTablePositions,
  useTables,
  useUploadFloorPlan,
} from '../api/areas.ts'
import { errorMessage } from '../api/areaErrors.ts'
import { AreaPanel } from '../components/AreaPanel.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { FloorPlanCanvas } from '../components/FloorPlanCanvas.tsx'
import { FloorPlanDropzone } from '../components/FloorPlanDropzone.tsx'
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

/** Shape and rotation of the selected table as chosen in its panel, before they are saved. */
type TablePreview = Pick<Table, 'id' | 'shape' | 'rotation'>

/** The next free table number: one more than the highest numeric table number of the restaurant. */
function nextTableNumber(tables: Table[]) {
  const numbers = tables.map((table) => Number(table.number)).filter((number) => Number.isInteger(number))
  return String(Math.max(0, ...numbers) + 1)
}

/**
 * Areas & tables: areas as tabs, the plan with its tables, and a panel with the selected table or area.
 * An area without floor plan image shows its tables on the schematic plan; an image can be uploaded below it.
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
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  // Not yet saved values of the panel, shown in the plan.
  const [tablePreview, setTablePreview] = useState<TablePreview | null>(null)
  const [tableScalePreview, setTableScalePreview] = useState<number | null>(null)
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

  function selectArea(areaId: string | null) {
    setSelectedAreaId(areaId)
    setSelectedTableId(null)
    setTablePreview(null)
    setTableScalePreview(null)
  }

  /** Selecting a table shows its panel instead of the area's, so an unsaved table size is dropped. */
  function selectTable(tableId: string | null) {
    if (tableId === selectedTableId) {
      return
    }
    setSelectedTableId(tableId)
    setTablePreview(null)
    if (tableId !== null) {
      setTableScalePreview(null)
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
      <Group justify="space-between">
        <Title order={2}>{t('admin.nav.areas')}</Title>
        <Button onClick={openCreate}>{t('areas.addArea')}</Button>
      </Group>

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
                    tableScale={tableScalePreview ?? area.tableScale}
                    tables={areaTables}
                    selectedTableId={selectedTableId}
                    onSelect={selectTable}
                    onMove={move}
                  />
                  <Text size="xs" c="dimmed">
                    {area.floorPlanUrl === null ? t('areas.dragHint') : `${t('areas.dragHint')} ${t('areas.newTableHint')}`}
                  </Text>
                  {area.floorPlanUrl === null && (
                    <FloorPlanDropzone onFile={(file) => upload(area, file)} loading={uploadFloorPlan.isPending} />
                  )}
                  <Text fw={500}>
                    {area.onlineBookingEnabled
                      ? t('areas.capacity', {
                          seats,
                          online: Math.floor((seats * area.onlineCapacityPercent) / 100),
                          percent: area.onlineCapacityPercent,
                        })
                      : t('areas.capacityOnlineBlocked', { seats })}
                  </Text>
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
                    onTableScaleChange={setTableScalePreview}
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
