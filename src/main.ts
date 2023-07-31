import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import pMap from 'p-map'

import { fetchAndRetry } from './retry.ts'

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

interface SetOptions {
  expiration?: Date | number
}

interface SetFilesItem extends SetOptions {
  key: string
  path: string
}

interface SetFilesOptions {
  concurrency?: number
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
    if ('contextURL' in this.authentication) {
      return {
        headers: {
          authorization: `Bearer ${this.authentication.token}`,
        },
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
      url,
    }
  }

  private static getExpirationHeaders(expiration: Date | number | undefined): Record<string, string> {
    if (typeof expiration === 'number') {
      return {
        [EXPIRY_HEADER]: (Date.now() + expiration).toString(),
      }
    }

    if (expiration instanceof Date) {
      return {
        [EXPIRY_HEADER]: expiration.getTime().toString(),
      }
    }

    if (expiration === undefined) {
      return {}
    }

    throw new TypeError(`'expiration' value must be a number or a Date, ${typeof expiration} found.`)
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

    const { headers: baseHeaders = {}, url } = await this.getFinalRequest(key, method)
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...extraHeaders,
    }

    if (method === HTTPMethod.Put) {
      headers['cache-control'] = 'max-age=0, stale-while-revalidate=60'
    }

    const options: RequestInit = {
      body,
      headers,
      method,
    }

    if (body instanceof ReadableStream) {
      // @ts-expect-error Part of the spec, but not typed:
      // https://fetch.spec.whatwg.org/#enumdef-requestduplex
      options.duplex = 'half'
    }

    const res = await fetchAndRetry(this.fetcher, url, options)

    if (res.status === 404 && method === HTTPMethod.Get) {
      return null
    }

    if (res.status !== 200) {
      throw new Error(`${method} operation has failed: store returned a ${res.status} response`)
    }

    return res
  }

  async delete(key: string) {
    await this.makeStoreRequest(key, HTTPMethod.Delete)
  }

  async get(key: string): Promise<string>
  async get(key: string, { type }: { type: 'arrayBuffer' }): Promise<ArrayBuffer>
  async get(key: string, { type }: { type: 'blob' }): Promise<Blob>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(key: string, { type }: { type: 'json' }): Promise<any>
  async get(key: string, { type }: { type: 'stream' }): Promise<ReadableStream>
  async get(key: string, { type }: { type: 'text' }): Promise<string>
  async get(
    key: string,
    options?: { type: 'arrayBuffer' | 'blob' | 'json' | 'stream' | 'text' },
  ): Promise<ArrayBuffer | Blob | ReadableStream | string | null> {
    const { type } = options ?? {}
    const res = await this.makeStoreRequest(key, HTTPMethod.Get)
    const expiration = res?.headers.get(EXPIRY_HEADER)

    if (typeof expiration === 'string') {
      const expirationTS = Number.parseInt(expiration)

      if (!Number.isNaN(expirationTS) && expirationTS <= Date.now()) {
        return null
      }
    }

    if (res === null) {
      return res
    }

    if (type === undefined || type === 'text') {
      return res.text()
    }

    if (type === 'arrayBuffer') {
      return res.arrayBuffer()
    }

    if (type === 'blob') {
      return res.blob()
    }

    if (type === 'json') {
      return res.json()
    }

    if (type === 'stream') {
      return res.body
    }

    throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`)
  }

  async set(key: string, data: BlobInput, { expiration }: SetOptions = {}) {
    const headers = Blobs.getExpirationHeaders(expiration)

    await this.makeStoreRequest(key, HTTPMethod.Put, headers, data)
  }

  async setFile(key: string, path: string, { expiration }: SetOptions = {}) {
    const { size } = await stat(path)
    const file = Readable.toWeb(createReadStream(path))
    const headers = {
      ...Blobs.getExpirationHeaders(expiration),
      'content-length': size.toString(),
    }

    await this.makeStoreRequest(key, HTTPMethod.Put, headers, file as ReadableStream)
  }

  setFiles(files: SetFilesItem[], { concurrency = 5 }: SetFilesOptions = {}) {
    return pMap(files, ({ key, path, ...options }) => this.setFile(key, path, options), { concurrency })
  }

  async setJSON(key: string, data: unknown, { expiration }: SetOptions = {}) {
    const payload = JSON.stringify(data)
    const headers = {
      ...Blobs.getExpirationHeaders(expiration),
      'content-type': 'application/json',
    }

    await this.makeStoreRequest(key, HTTPMethod.Put, headers, payload)
  }
}
