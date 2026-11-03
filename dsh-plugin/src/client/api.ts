/** Same-origin API base for the browser half. Mirrors API_PREFIX in src/index.js. */
export const API_BASE = '/agy-auth/api'

/** Error carrying the Host API's stable code and remediation. */
export class ApiError extends Error {
  code: string
  hint?: string

  /**
   * @param code - stable machine code.
   * @param message - user-facing message.
   * @param hint - optional remediation.
   */
  constructor(code: string, message: string, hint?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    if (hint !== undefined) this.hint = hint
  }
}

/**
 * Fetch JSON from the Host half.
 * @param path - path below the API base.
 * @param init - fetch options.
 * @returns parsed JSON.
 * @throws {ApiError} when the response is not JSON or the transport fails.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new ApiError('network_error', error instanceof Error ? error.message : 'the Harness Host is unreachable')
  }
  const text = await response.text()
  let payload: unknown
  try {
    payload = text === '' ? undefined : JSON.parse(text)
  } catch {
    throw new ApiError('invalid_response', `the Host returned a non-JSON response (${response.status})`)
  }
  if (!response.ok) {
    const error = payload !== null && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { code?: string; message?: string; hint?: string } }).error
      : undefined
    throw new ApiError(error?.code ?? 'request_failed', error?.message ?? `request failed (${response.status})`, error?.hint)
  }
  return payload as T
}

/**
 * POST one JSON body.
 * @param path - path below the API base.
 * @param body - JSON body.
 * @returns parsed JSON.
 */
export function apiPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return apiJson<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
