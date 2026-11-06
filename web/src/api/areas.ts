import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from './client.ts'

/** An area of the restaurant, as returned by /api/admin/areas. */
export type Area = {
  id: string
  name: string
  sortOrder: number
  /** URL of the floor plan image; null until one is uploaded. */
  floorPlanUrl: string | null
  /** Short text for the guest's choice of the area, at most 200 characters; null when empty. */
  description: string | null
  /** URL of the area's photo; null without one. */
  photoUrl: string | null
  onlineBookingEnabled: boolean
  /** Share of the seats that can be booked online, 0–100. */
  onlineCapacityPercent: number
  /** Scales the drawn tables of this area in whole percent: 50 to 200 as set, or derived from `widthMeters`. */
  tableScale: number
  /** Floor and boundary of the drawn room; only drawn without floor plan image. */
  roomStyle: RoomStyle
  /** The real width of the plan in metres (5–80), null when unknown; with it the tables have their real size. */
  widthMeters: number | null
}

/** The kind of room of an area without floor plan image: it sets the drawn floor and boundary. */
export type RoomStyle = 'Indoor' | 'Terrace' | 'Garden' | 'Rooftop'

export type RoomElementKind = 'Entrance' | 'Window' | 'Bar' | 'Plant' | 'Pillar' | 'Sofa' | 'Stage' | 'Service' | 'Stairs' | 'Label'

/** Degrees, clockwise. At 0 the element's front faces up (at the bottom wall), at 90 right, at 180 down, at 270 left. */
export type RoomRotation = 0 | 90 | 180 | 270

/**
 * An object of the room that is not a table, e.g. the entrance or the bar. `posX`/`posY` are its centre, 0–1 as for tables;
 * `width` and `height` its extent as it lies on the plan, as fractions of the plan width and of the plan height.
 */
export type RoomElement = {
  id: string
  kind: RoomElementKind
  posX: number
  posY: number
  width: number
  height: number
  rotation: RoomRotation
  /** At most 40 characters; required for a Label. */
  label: string | null
}

/** The room of an area, as returned by GET /api/admin/areas/{id}/room. */
export type Room = { roomStyle: RoomStyle; elements: RoomElement[] }

export type TableShape = 'Round' | 'Square' | 'Rectangle'

/** Degrees; only visible on rectangular tables. */
export type TableRotation = 0 | 90

/** A table on an area's floor plan. The position is relative to the plan (image or schematic plan), 0–1. */
export type Table = {
  id: string
  areaId: string
  number: string
  seats: number
  /** The smallest party the table is given to online, 1 to `seats`; staff can give it to any party that fits. */
  minGuests: number
  posX: number
  posY: number
  shape: TableShape
  rotation: TableRotation
}

export type TablePosition = Pick<Table, 'id' | 'posX' | 'posY'>

/**
 * Tables of an area pushed together for a larger group, as returned by /api/admin/areas/{id}/combinations. `tableIds` are in
 * number order, `label` their numbers ("4 + 5"). The system only gives it when no single table fits the party.
 */
export type TableCombination = {
  id: string
  areaId: string
  tableIds: string[]
  label: string
  /** At least the seats of the largest table + 1. */
  seats: number
  /** The smallest party it is given to online, 1 to `seats`. */
  minGuests: number
  onlineBookable: boolean
}

/** The floor plan accepts these image types up to this size (checked again by the API). */
export const floorPlanTypes = ['image/png', 'image/jpeg', 'image/webp']
export const maxFloorPlanBytes = 10 * 1024 * 1024

const areasKey = ['admin', 'areas'] as const
const tablesKey = ['admin', 'tables'] as const
const roomKey = (areaId: string) => ['admin', 'room', areaId] as const
const combinationsKey = ['admin', 'combinations'] as const

/** The restaurant's areas in their order. */
export function useAreas() {
  return useQuery({ queryKey: areasKey, queryFn: () => apiGet<Area[]>('/admin/areas') })
}

/** All tables of the restaurant, of every area. */
export function useTables() {
  return useQuery({ queryKey: tablesKey, queryFn: () => apiGet<Table[]>('/admin/tables') })
}

export function useCreateArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => apiPost<Area>('/admin/areas', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKey }),
  })
}

export function useUpdateArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...area
    }: Pick<Area, 'id' | 'name' | 'onlineBookingEnabled' | 'onlineCapacityPercent' | 'widthMeters'> & {
      description: string
      /** Without it the stored value stays; ignored by the API while a real width is set. */
      tableScale?: number
    }) =>
      apiPut<Area>(`/admin/areas/${id}`, area),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKey }),
  })
}

/** Deletes the area together with its tables and floor plan. */
export function useDeleteArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/areas/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: areasKey }),
        queryClient.invalidateQueries({ queryKey: tablesKey }),
        queryClient.invalidateQueries({ queryKey: combinationsKey }),
      ])
    },
  })
}

/** Saves a new order; `areaIds` contains every area once. */
export function useReorderAreas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (areaIds: string[]) => apiPut<Area[]>('/admin/areas/order', { areaIds }),
    onSuccess: (areas) => queryClient.setQueryData(areasKey, areas),
  })
}

export function useUploadFloorPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, file }: { areaId: string; file: File }) => apiPut<Area>(`/admin/areas/${areaId}/floorplan`, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKey }),
  })
}

/** Uploads or replaces the photo of the area (PNG, JPEG or WebP, at most 10 MB, like the floor plan). */
export function useUploadAreaPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, file }: { areaId: string; file: File }) => apiPut<Area>(`/admin/areas/${areaId}/photo`, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKey }),
  })
}

export function useDeleteAreaPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (areaId: string) => apiDelete<Area>(`/admin/areas/${areaId}/photo`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKey }),
  })
}

/** The room of an area: its style and its elements; nothing is loaded without area (null). */
export function useRoom(areaId: string | null) {
  return useQuery({
    queryKey: roomKey(areaId ?? ''),
    queryFn: () => apiGet<Room>(`/admin/areas/${areaId}/room`),
    enabled: areaId !== null,
  })
}

/**
 * Replaces style and elements of the room. The API gives every saved element a new id; the cache keeps the ids that were
 * sent (in the same order), so an element stays selected in the editor across saves.
 */
export function useSaveRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, room }: { areaId: string; room: Room }) => apiPut<Room>(`/admin/areas/${areaId}/room`, room),
    onSuccess: async (saved, { areaId, room }) => {
      queryClient.setQueryData<Room>(roomKey(areaId), {
        roomStyle: saved.roomStyle,
        elements: saved.elements.map((element, i) => ({ ...element, id: room.elements[i]?.id ?? element.id })),
      })
      await queryClient.invalidateQueries({ queryKey: areasKey })
    },
  })
}

/** Replaces the elements with the suggested room for the area's style and arranges its tables anew around them. */
export function useSuggestRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (areaId: string) => apiPost<Room & { tables: Table[] }>(`/admin/areas/${areaId}/suggest-room`),
    onSuccess: ({ tables: arranged, ...room }, areaId) => {
      queryClient.setQueryData<Room>(roomKey(areaId), room)
      queryClient.setQueryData<Table[]>(tablesKey, (tables) => tables?.map((table) => arranged.find((a) => a.id === table.id) ?? table))
    },
  })
}

/** Adds a table: in the middle of the floor plan image, or on a free place of an area without image. */
export function useCreateTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (table: Pick<Table, 'areaId' | 'number' | 'seats'>) => apiPost<Table>('/admin/tables', table),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tablesKey }),
  })
}

export function useUpdateTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...table }: Pick<Table, 'id' | 'number' | 'seats' | 'minGuests' | 'shape' | 'rotation'>) => apiPut<Table>(`/admin/tables/${id}`, table),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tablesKey }),
  })
}

/** Deletes the table together with the combinations it is part of. */
export function useDeleteTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/tables/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tablesKey }),
        queryClient.invalidateQueries({ queryKey: combinationsKey }),
      ])
    },
  })
}

/** Saves the positions of several tables in one request. */
export function useSaveTablePositions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (positions: TablePosition[]) => apiPut<Table[]>('/admin/tables/positions', positions),
    onSuccess: (saved) =>
      queryClient.setQueryData<Table[]>(tablesKey, (tables) =>
        tables?.map((table) => saved.find((s) => s.id === table.id) ?? table),
      ),
  })
}

/** Arranges all tables of the area anew (replaces their positions) and returns the area's tables. */
export function useArrangeTables() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (areaId: string) => apiPost<Table[]>(`/admin/areas/${areaId}/arrange-tables`),
    onSuccess: (arranged) =>
      queryClient.setQueryData<Table[]>(tablesKey, (tables) =>
        tables?.map((table) => arranged.find((a) => a.id === table.id) ?? table),
      ),
  })
}

/** The combinations of the area, by their first table's number. */
export function useCombinations(areaId: string | null) {
  return useQuery({
    queryKey: [...combinationsKey, areaId],
    queryFn: () => apiGet<TableCombination[]>(`/admin/areas/${areaId}/combinations`),
    enabled: areaId !== null,
  })
}

/** Combines two or more tables of the area; seats, smallest online party and online booking get their defaults. */
export function useCreateCombination() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, tableIds }: { areaId: string; tableIds: string[] }) =>
      apiPost<TableCombination>(`/admin/areas/${areaId}/combinations`, { tableIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: combinationsKey }),
  })
}

export function useUpdateCombination() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, id, ...combination }: Pick<TableCombination, 'areaId' | 'id' | 'seats' | 'minGuests' | 'onlineBookable'>) =>
      apiPut<TableCombination>(`/admin/areas/${areaId}/combinations/${id}`, combination),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: combinationsKey }),
  })
}

export function useDeleteCombination() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, id }: Pick<TableCombination, 'areaId' | 'id'>) => apiDelete(`/admin/areas/${areaId}/combinations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: combinationsKey }),
  })
}
