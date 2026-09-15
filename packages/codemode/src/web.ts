export * as Web from "./web.js"

import { Extension } from "./extension.js"

/** Outbound HTTP for programs. Nothing is reachable unless a host lists it. */
export type Options = {
  /** Origins the program may request, such as `"https://api.example.com"`; `"*"` allows every origin. */
  readonly allow: ReadonlyArray<string>
  /** Request methods the program may use. Default: `GET` and `HEAD`. */
  readonly methods?: ReadonlyArray<string>
  /** Largest response body accepted, in bytes. Default: 1 MiB. */
  readonly maxBodyBytes?: number
  /** Time allowed for a request, including redirects and reading the body. Default: 30 seconds. */
  readonly timeoutMs?: number
}

const MAX_REDIRECTS = 5

/** The model-facing signature of the `fetch` global, for hosts to include in their instructions. */
export const signature = `fetch(url: string | URL, init?: { method?: string; headers?: Record<string, string> | Array<[string, string]>; body?: string | Uint8Array | URLSearchParams }): Promise<{ url: string; status: number; statusText: string; ok: boolean; redirected: boolean; headers: { get(name: string): string | null; has(name: string): boolean; entries(): Array<[string, string]> }; text(): Promise<string>; json(): Promise<unknown>; bytes(): Promise<Uint8Array> }>`

export const make = (options: Options): Extension => {
  const methods = new Set((options.methods ?? ["GET", "HEAD"]).map((method) => method.toUpperCase()))
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024
  const timeoutMs = options.timeoutMs ?? 30_000

  const checkUrl = (url: URL, what: string) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError(`fetch: ${what} ${url.href} must use http or https.`)
    }
    if (options.allow.includes("*") || options.allow.includes(url.origin)) return
    throw new TypeError(`fetch: ${what} ${url.href} is not an allowed origin. Allowed: ${options.allow.join(", ")}.`)
  }

  // Redirects are followed by hand so every hop is checked against the allow list before it is requested.
  const request = async (
    url: URL,
    method: string,
    headers: Headers,
    body: string | Uint8Array<ArrayBuffer> | URLSearchParams | undefined,
    signal: AbortSignal,
    hop: number,
  ): Promise<Response> => {
    const response = await globalThis
      .fetch(url, { method, headers, body, signal, redirect: "manual" })
      .catch((cause: unknown) => {
        if (signal.aborted) throw new Error(`fetch: request to ${url.href} timed out after ${timeoutMs}ms.`)
        throw new TypeError(`fetch: request to ${url.href} failed: ${cause instanceof Error ? cause.message : cause}`)
      })
    const location = response.headers.get("location")
    if (response.status < 300 || response.status > 399 || location === null) return response
    if (hop === MAX_REDIRECTS) throw new TypeError(`fetch: ${url.href} redirected more than ${MAX_REDIRECTS} times.`)
    const next = new URL(location, url)
    checkUrl(next, "redirect to")
    // Like browsers: 303 always switches to GET, 301/302 do so for POST, 307/308 keep the method and body.
    const toGet = response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")
    return request(next, toGet ? "GET" : method, headers, toGet ? undefined : body, signal, hop + 1)
  }

  const readBody = async (response: Response, url: URL): Promise<Uint8Array> => {
    const tooLarge = () => new RangeError(`fetch: response from ${url.href} exceeds ${maxBodyBytes} bytes.`)
    if (Number(response.headers.get("content-length")) > maxBodyBytes) throw tooLarge()
    if (response.body === null) return new Uint8Array()
    const chunks: Array<Uint8Array> = []
    let total = 0
    for await (const chunk of response.body) {
      total += chunk.byteLength
      if (total > maxBodyBytes) throw tooLarge()
      chunks.push(chunk)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }

  const fetch = async (input: unknown, init: unknown = {}) => {
    if (typeof input !== "string" && !(input instanceof URL)) {
      throw new TypeError("fetch: the first argument must be a URL string or URL.")
    }
    const url = URL.parse(String(input))
    if (url === null) throw new TypeError(`fetch: ${JSON.stringify(String(input))} is not a valid URL.`)
    checkUrl(url, "request to")
    if (init === null || typeof init !== "object" || Array.isArray(init)) {
      throw new TypeError("fetch: init must be an object with method, headers, and body.")
    }
    for (const key of Object.keys(init)) {
      if (key !== "method" && key !== "headers" && key !== "body") {
        throw new TypeError(`fetch: init.${key} is not supported here; only method, headers, and body are.`)
      }
    }
    const given = init as { method?: unknown; headers?: unknown; body?: unknown }
    const method = given.method === undefined ? "GET" : String(given.method).toUpperCase()
    if (!methods.has(method)) {
      throw new TypeError(`fetch: method ${method} is not allowed. Allowed: ${[...methods].join(", ")}.`)
    }
    if (given.headers !== undefined && (given.headers === null || typeof given.headers !== "object")) {
      throw new TypeError("fetch: init.headers must be a { name: value } object or an array of [name, value] pairs.")
    }
    const raw = given.body
    if (
      raw !== undefined &&
      typeof raw !== "string" &&
      !(raw instanceof Uint8Array) &&
      !(raw instanceof URLSearchParams)
    ) {
      throw new TypeError("fetch: init.body must be a string, Uint8Array, or URLSearchParams.")
    }
    const body = raw instanceof Uint8Array ? Uint8Array.from(raw) : raw
    const headers = new Headers(given.headers as Record<string, string> | Array<[string, string]> | undefined)
    const signal = AbortSignal.timeout(timeoutMs)
    const response = await request(url, method, headers, body, signal, 0)
    const bytes = await readBody(response, url).catch((cause: unknown) => {
      if (signal.aborted) throw new Error(`fetch: request to ${url.href} timed out after ${timeoutMs}ms.`)
      throw cause
    })
    const received = Object.fromEntries(response.headers)
    const text = () => new TextDecoder().decode(bytes)
    return {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      redirected: response.url !== url.href,
      headers: {
        get: (name: string) => received[String(name).toLowerCase()] ?? null,
        has: (name: string) => String(name).toLowerCase() in received,
        entries: () => Object.entries(received),
      },
      text: async () => text(),
      json: async () => JSON.parse(text()) as unknown,
      bytes: async () => bytes,
    }
  }

  return Extension.make({ name: "web", globals: { fetch } })
}
