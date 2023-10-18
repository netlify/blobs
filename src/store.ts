import { Client } from './client.ts'
import { decodeMetadata, Metadata } from './metadata.ts'
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
   * Arbitrary metadata object to associate with an entry. Must be seralizable
   * to JSON.
   */
  metadata?: Metadata
}

type BlobWithMetadata = { etag?: string } & { metadata: Metadata }
type BlobResponseType = 'arrayBuffer' | 'blob' | 'json' | 'stream' | 'text'

export class Store {
  private client: Client
  private name: string

  constructor(options: StoreOptions) {
    this.client = options.client
    this.name = 'deployID' in options ? `deploy:${options.deployID}` : options.name
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
    options?: { type: BlobResponseType },
  ): Promise<ArrayBuffer | Blob | ReadableStream | string | null> {
    const { type } = options ?? {}
    const res = await this.client.makeRequest({ key, method: HTTPMethod.GET, storeName: this.name })

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

  async getWithMetadata(key: string): Promise<{ data: string } & BlobWithMetadata>

  async getWithMetadata(
    key: string,
    { type }: { type: 'arrayBuffer' },
  ): Promise<{ data: ArrayBuffer } & BlobWithMetadata>

  async getWithMetadata(key: string, { type }: { type: 'blob' }): Promise<{ data: Blob } & BlobWithMetadata>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getWithMetadata(key: string, { type }: { type: 'json' }): Promise<{ data: any } & BlobWithMetadata>

  async getWithMetadata(key: string, { type }: { type: 'stream' }): Promise<{ data: ReadableStream } & BlobWithMetadata>

  async getWithMetadata(key: string, { type }: { type: 'text' }): Promise<{ data: string } & BlobWithMetadata>

  async getWithMetadata(
    key: string,
    options?: { type: BlobResponseType },
  ): Promise<
    | ({
        data: ArrayBuffer | Blob | ReadableStream | string | null
      } & BlobWithMetadata)
    | null
  > {
    const { type } = options ?? {}
    const res = await this.client.makeRequest({ key, method: HTTPMethod.GET, storeName: this.name })
    const etag = res?.headers.get('etag') ?? undefined

    let metadata: Metadata = {}

    try {
      metadata = decodeMetadata(res?.headers)
    } catch {
      throw new Error(
        'An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client.',
      )
    }

    if (res === null) {
      return null
    }

    if (type === undefined || type === 'text') {
      return { data: await res.text(), etag, metadata }
    }

    if (type === 'arrayBuffer') {
      return { data: await res.arrayBuffer(), etag, metadata }
    }

    if (type === 'blob') {
      return { data: await res.blob(), etag, metadata }
    }

    if (type === 'json') {
      return { data: await res.json(), etag, metadata }
    }

    if (type === 'stream') {
      return { data: res.body, etag, metadata }
    }

    throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`)
  }

  async set(key: string, data: BlobInput, { metadata }: SetOptions = {}) {
    await this.client.makeRequest({
      body: data,
      key,
      metadata,
      method: HTTPMethod.PUT,
      storeName: this.name,
    })
  }

  async setJSON(key: string, data: unknown, { metadata }: SetOptions = {}) {
    const payload = JSON.stringify(data)
    const headers = {
      'content-type': 'application/json',
    }

    await this.client.makeRequest({
      body: payload,
      headers,
      key,
      metadata,
      method: HTTPMethod.PUT,
      storeName: this.name,
    })
  }
}
