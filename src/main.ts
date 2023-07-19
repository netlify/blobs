interface APICredentials {
  apiURL?: string
  token: string
}

interface ContextCredentials {
  contextURL: string
  token: string
}

interface BlobsOptions {
  authentication: APICredentials | ContextCredentials
  context?: string
  fetcher?: typeof globalThis.fetch
  siteID: string
}

enum HTTPMethod {
  Delete = 'delete',
  Get = 'get',
  Put = 'put',
}

enum ResponseType {
  ArrayBuffer = 'arrayBuffer',
  Blob = 'blob',
  JSON = 'json',
  Stream = 'stream',
  Text = 'text',
}

type BlobInput = ReadableStream | string | ArrayBuffer | Blob

const EXPIRY_HEADER = 'x-nf-expires-at'

export class Blobs {
  private authentication: APICredentials | ContextCredentials
  private context: string
  private fetcher: typeof globalThis.fetch
  private siteID: string

  constructor({ authentication, context, fetcher, siteID }: BlobsOptions) {
    this.context = context ?? 'production'
    this.fetcher = fetcher ?? globalThis.fetch
    this.siteID = siteID

    if ('contextURL' in authentication) {
      this.authentication = authentication
    } else {
      this.authentication = {
        apiURL: authentication.apiURL ?? 'https://api.netlify.com',
        token: authentication.token,
      }
    }

    if (fetcher) {
      this.fetcher = fetcher
    } else if (globalThis.fetch) {
      this.fetcher = globalThis.fetch
    } else {
      throw new Error('You must specify a fetch-compatible `fetcher` parameter when `fetch` is not available globally')
    }
  }

  private async getFinalRequest(key: string, method: string) {
    const finalMethod = method

    if ('contextURL' in this.authentication) {
      return {
        headers: {
          authorization: `Bearer ${this.authentication.token}`,
        },
        method: finalMethod,
        url: `${this.authentication.contextURL}/${this.siteID}/${this.context}/${key}`,
      }
    }

    const apiURL = `${this.authentication.apiURL}/api/v1/sites/${this.siteID}/blobs/${key}?context=${this.context}`
    const headers = { authorization: `Bearer ${this.authentication.token}` }
    const res = await this.fetcher(apiURL, { headers, method })

    if (res.status !== 200) {
      throw new Error(`${method} operation has failed: API returned a ${res.status} response`)
    }

    const { url } = await res.json()

    return {
      method: finalMethod,
      url,
    }
  }

  private isConfigured() {
    return Boolean(this.authentication?.token) && Boolean(this.siteID)
  }

  private async makeStoreRequest(
    key: string,
    method: HTTPMethod,
    extraHeaders?: Record<string, string>,
    body?: BlobInput | null,
  ) {
    if (!this.isConfigured()) {
      throw new Error("The blob store is unavailable because it's missing required configuration properties")
    }

    const { headers: baseHeaders = {}, method: finalMethod, url } = await this.getFinalRequest(key, method)
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...extraHeaders,
    }

    if (method === HTTPMethod.Put) {
      headers['cache-control'] = 'max-age=0, stale-while-revalidate=60'
    }

    const res = await this.fetcher(url, { body, headers, method: finalMethod })

    if (res.status === 404 && finalMethod === HTTPMethod.Get) {
      return null
    }

    if (res.status !== 200) {
      const details = await res.text()

      throw new Error(`${method} operation has failed: ${details}`)
    }

    return res
  }

  async delete(key: string) {
    await this.makeStoreRequest(key, HTTPMethod.Delete)
  }

  async get(key: string): Promise<string>
  async get(key: string, { type }: { type: ResponseType.ArrayBuffer }): Promise<ArrayBuffer>
  async get(key: string, { type }: { type: ResponseType.Blob }): Promise<Blob>
  async get(key: string, { type }: { type: ResponseType.Stream }): Promise<ReadableStream | null>
  async get(key: string, { type }: { type: ResponseType.Text }): Promise<string>
  async get(
    key: string,
    options?: { type: ResponseType },
  ): Promise<ArrayBuffer | Blob | ReadableStream | string | null> {
    const { type } = options ?? {}
    const res = await this.makeStoreRequest(key, HTTPMethod.Get)
    const expiry = res?.headers.get(EXPIRY_HEADER)

    if (typeof expiry === 'string') {
      const expiryTS = Number.parseInt(expiry)

      if (!Number.isNaN(expiryTS) && expiryTS <= Date.now()) {
        return null
      }
    }

    if (res === null) {
      return res
    }

    if (type === undefined || type === ResponseType.Text) {
      return res.text()
    }

    if (type === ResponseType.ArrayBuffer) {
      return res.arrayBuffer()
    }

    if (type === ResponseType.Blob) {
      return res.blob()
    }

    if (type === ResponseType.JSON) {
      return res.json()
    }

    if (type === ResponseType.Stream) {
      return res.body
    }

    throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`)
  }

  async set(key: string, data: BlobInput, { ttl }: { ttl?: Date | number } = {}) {
    const headers: Record<string, string> = {}

    if (typeof ttl === 'number') {
      headers[EXPIRY_HEADER] = (Date.now() + ttl).toString()
    } else if (ttl instanceof Date) {
      headers[EXPIRY_HEADER] = ttl.getTime().toString()
    } else if (ttl !== undefined) {
      throw new TypeError(`'ttl' value must be a number or a Date, ${typeof ttl} found.`)
    }

    await this.makeStoreRequest(key, HTTPMethod.Put, headers, data)
  }

  async setJSON(key: string, data: unknown) {
    const payload = JSON.stringify(data)
    const headers = {
      'content-type': 'application/json',
    }

    await this.makeStoreRequest(key, HTTPMethod.Put, headers, payload)
  }
}
