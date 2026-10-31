/**
 * Why a request failed:
 * - network: the server could not be reached
 * - http: the server answered with a non-2xx status
 * - parse: the answer was not valid JSON
 */
export type ApiErrorKind = 'network' | 'http' | 'parse'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status, null when the server could not be reached. */
  readonly status: number | null

  constructor(kind: ApiErrorKind, status: number | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

/** GETs a JSON resource from the API. `path` is relative to /api, e.g. "/tenants". Throws ApiError. */
export async function apiGet<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } })
  } catch (error) {
    throw new ApiError('network', null, error instanceof Error ? error.message : String(error))
  }

  if (!response.ok) {
    throw new ApiError('http', response.status, `GET /api${path} failed with HTTP ${response.status}`)
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new ApiError('parse', response.status, error instanceof Error ? error.message : String(error))
  }
}
