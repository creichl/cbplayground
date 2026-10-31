import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from './client.ts'

/** An area of the restaurant, as returned by /api/admin/areas. */
export type Area = {
  id: string
  name: string
  sortOrder: number
  /** URL of the floor plan image; null until one is uploaded. */
  floorPlanUrl: string | null
  onlineBookingEnabled: boolean
  /** Share of the seats that can be booked online, 0–100. */
  onlineCapacityPercent: number
}

/** A table on an area's floor plan. The position is relative to the image, 0–1. */
export type Table = {
  id: string
  areaId: string
  number: string
  seats: number
  posX: number
  posY: number
}

export type TablePosition = Pick<Table, 'id' | 'posX' | 'posY'>

/** The floor plan accepts these image types up to this size (checked again by the API). */
export const floorPlanTypes = ['image/png', 'image/jpeg', 'image/webp']
export const maxFloorPlanBytes = 10 * 1024 * 1024

const areasKey = ['admin', 'areas'] as const
const tablesKey = ['admin', 'tables'] as const

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
    mutationFn: ({ id, ...area }: Pick<Area, 'id' | 'name' | 'onlineBookingEnabled' | 'onlineCapacityPercent'>) =>
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

/** Adds a table in the middle of the area's floor plan. */
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
    mutationFn: ({ id, ...table }: Pick<Table, 'id' | 'number' | 'seats'>) => apiPut<Table>(`/admin/tables/${id}`, table),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tablesKey }),
  })
}

export function useDeleteTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/tables/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tablesKey }),
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
