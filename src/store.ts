import { Client } from './client.ts'
import { BlobInput, HTTPMethod } from './types.ts'

interface BaseStoreOptions {
  client: Client
}

interface DeployStoreOptions extends BaseStoreOptions {
  deployID: string
}

interface NamedStoreOptions extends BaseStoreOptions {
  name: string
}

type StoreOptions = DeployStoreOptions | NamedStoreOptions

interface SetOptions {
  /**
   * Accepts an absolute date as a `Date` object, or a relative date as the
   * number of seconds from the current date.
   */
  expiration?: Date | number
}

const EXPIRY_HEADER = 'x-nf-expires-at'

export class Store {
  private client: Client
  private name: string

  constructor(options: StoreOptions) {
    this.client = options.client
    this.name = 'deployID' in options ? `deploy:${options.deployID}` : options.name
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

  async delete(key: string) {
    await this.client.makeRequest({ key, method: HTTPMethod.DELETE, storeName: this.name })
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
    const res = await this.client.makeRequest({ key, method: HTTPMethod.GET, storeName: this.name })
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
    const headers = Store.getExpirationHeaders(expiration)

    await this.client.makeRequest({
      body: data,
      headers,
      key,
      method: HTTPMethod.PUT,
      storeName: this.name,
    })
  }

  async setJSON(key: string, data: unknown, { expiration }: SetOptions = {}) {
    const payload = JSON.stringify(data)
    const headers = {
      ...Store.getExpirationHeaders(expiration),
      'content-type': 'application/json',
    }

    await this.client.makeRequest({
      body: payload,
      headers,
      key,
      method: HTTPMethod.PUT,
      storeName: this.name,
    })
  }
}
