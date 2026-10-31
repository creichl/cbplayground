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
  /** Error code the server sent as `{ "error": "..." }`, e.g. "invalid_credentials"; null if there is none. */
  readonly code: string | null

  constructor(kind: ApiErrorKind, status: number | null, message: string, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  // A file is sent as it is, everything else as JSON.
  const isFile = body instanceof Blob
  if (isFile) {
    headers['Content-Type'] = body.type || 'application/octet-stream'
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: isFile ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError('network', null, error instanceof Error ? error.message : String(error))
  }

  if (!response.ok) {
    let code: string | null = null
    try {
      const errorBody: unknown = await response.json()
      if (typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody && typeof errorBody.error === 'string') {
        code = errorBody.error
      }
    } catch {
      // Most error responses have no JSON body.
    }
    throw new ApiError('http', response.status, `${method} /api${path} failed with HTTP ${response.status}`, code)
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new ApiError('parse', response.status, error instanceof Error ? error.message : String(error))
  }
}

/** GETs a JSON resource from the API. `path` is relative to /api, e.g. "/tenants". Throws ApiError. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

/** POSTs `body` as JSON to the API and returns the JSON answer (undefined for 204). Throws ApiError. */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body)
}

/** PUTs `body` to the API, as JSON or, for a File/Blob, as the raw file. Returns the JSON answer (undefined for 204). Throws ApiError. */
export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body)
}

/** DELETEs a resource of the API. Throws ApiError. */
export function apiDelete(path: string): Promise<void> {
  return request<void>('DELETE', path)
}
