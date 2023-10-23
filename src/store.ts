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

interface GetWithMetadataOptions {
  etag?: string
}

interface GetWithMetadataResult {
  etag?: string
  fresh: boolean
  metadata: Metadata
}

interface SetOptions {
  /**
   * Arbitrary metadata object to associate with an entry. Must be seralizable
   * to JSON.
   */
  metadata?: Metadata
}

type BlobResponseType = 'arrayBuffer' | 'blob' | 'json' | 'stream' | 'text'

export class Store {
  private client: Client
  private name: string

  constructor(options: StoreOptions) {
    this.client = options.client

    if ('deployID' in options) {
      this.name = `deploy:${encodeURIComponent(options.deployID)}`
    } else if (options?.name.startsWith('deploy:')) {
      throw new Error('Store name cannot start with the string `deploy:`, which is a reserved namespace')
    } else {
      this.name = encodeURIComponent(options.name)
    }
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

  async getWithMetadata(
    key: string,
    options?: GetWithMetadataOptions,
  ): Promise<{ data: string } & GetWithMetadataResult>

  async getWithMetadata(
    key: string,
    options: { type: 'arrayBuffer' } & GetWithMetadataOptions,
  ): Promise<{ data: ArrayBuffer } & GetWithMetadataResult>

  async getWithMetadata(
    key: string,
    options: { type: 'blob' } & GetWithMetadataOptions,
  ): Promise<{ data: Blob } & GetWithMetadataResult>

  /* eslint-disable @typescript-eslint/no-explicit-any */

  async getWithMetadata(
    key: string,
    options: { type: 'json' } & GetWithMetadataOptions,
  ): Promise<{ data: any } & GetWithMetadataResult>

  /* eslint-enable @typescript-eslint/no-explicit-any */

  async getWithMetadata(
    key: string,
    options: { type: 'stream' } & GetWithMetadataOptions,
  ): Promise<{ data: ReadableStream } & GetWithMetadataResult>

  async getWithMetadata(
    key: string,
    options: { type: 'text' } & GetWithMetadataOptions,
  ): Promise<{ data: string } & GetWithMetadataResult>

  async getWithMetadata(
    key: string,
    options?: { type: BlobResponseType } & GetWithMetadataOptions,
  ): Promise<
    | ({
        data: ArrayBuffer | Blob | ReadableStream | string | null
      } & GetWithMetadataResult)
    | null
  > {
    const { etag: requestETag, type } = options ?? {}
    const headers = requestETag ? { 'if-none-match': requestETag } : undefined
    const res = await this.client.makeRequest({ headers, key, method: HTTPMethod.GET, storeName: this.name })
    const responseETag = res?.headers.get('etag') ?? undefined

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

    const result: GetWithMetadataResult = {
      etag: responseETag,
      fresh: false,
      metadata,
    }

    if (res.status === 304 && requestETag) {
      return { data: null, ...result, fresh: true }
    }

    if (type === undefined || type === 'text') {
      return { data: await res.text(), ...result }
    }

    if (type === 'arrayBuffer') {
      return { data: await res.arrayBuffer(), ...result }
    }

    if (type === 'blob') {
      return { data: await res.blob(), ...result }
    }

    if (type === 'json') {
      return { data: await res.json(), ...result }
    }

    if (type === 'stream') {
      return { data: res.body, ...result }
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
