import { Buffer } from 'node:buffer'

import { ListResponse, ListResponseBlob } from './backend/list.ts'
import { Client } from './client.ts'
import { getMetadataFromResponse, Metadata } from './metadata.ts'
import { BlobInput, HTTPMethod } from './types.ts'
import { BlobsInternalError, collectIterator } from './util.ts'

interface BaseStoreOptions {
  client: Client
}

interface DeployStoreOptions extends BaseStoreOptions {
  deployID: string
}

interface NamedStoreOptions extends BaseStoreOptions {
  name: string
}

export type StoreOptions = DeployStoreOptions | NamedStoreOptions

export interface GetWithMetadataOptions {
  etag?: string
}

export interface GetWithMetadataResult {
  etag?: string
  metadata: Metadata
}

export interface ListResult {
  blobs: ListResultBlob[]
  directories: string[]
}

export interface ListResultBlob {
  etag: string
  key: string
}

export interface ListOptions {
  directories?: boolean
  paginate?: boolean
  prefix?: string
}

export interface SetOptions {
  /**
   * Arbitrary metadata object to associate with an entry. Must be seralizable
   * to JSON.
   */
  metadata?: Metadata
}

export type BlobResponseType = 'arrayBuffer' | 'blob' | 'json' | 'stream' | 'text'

export class Store {
  private client: Client
  private name: string

  constructor(options: StoreOptions) {
    this.client = options.client

    if ('deployID' in options) {
      Store.validateDeployID(options.deployID)

      this.name = `deploy:${options.deployID}`
    } else {
      Store.validateStoreName(options.name)

      this.name = options.name
    }
  }

  async delete(key: string) {
    const res = await this.client.makeRequest({ key, method: HTTPMethod.DELETE, storeName: this.name })

    if (![200, 204, 404].includes(res.status)) {
      throw new BlobsInternalError(res.status)
    }
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

    if (res.status === 404) {
      return null
    }

    if (res.status !== 200) {
      throw new BlobsInternalError(res.status)
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

    throw new BlobsInternalError(res.status)
  }

  async getMetadata(key: string) {
    const res = await this.client.makeRequest({ key, method: HTTPMethod.HEAD, storeName: this.name })

    if (res.status === 404) {
      return null
    }

    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res.status)
    }

    const etag = res?.headers.get('etag') ?? undefined
    const metadata = getMetadataFromResponse(res)
    const result = {
      etag,
      metadata,
    }

    return result
  }

  async getWithMetadata(
    key: string,
    options?: GetWithMetadataOptions,
  ): Promise<({ data: string } & GetWithMetadataResult) | null>

  async getWithMetadata(
    key: string,
    options: { type: 'arrayBuffer' } & GetWithMetadataOptions,
  ): Promise<{ data: ArrayBuffer } & GetWithMetadataResult>

  async getWithMetadata(
    key: string,
    options: { type: 'blob' } & GetWithMetadataOptions,
  ): Promise<({ data: Blob } & GetWithMetadataResult) | null>

  /* eslint-disable @typescript-eslint/no-explicit-any */

  async getWithMetadata(
    key: string,
    options: { type: 'json' } & GetWithMetadataOptions,
  ): Promise<({ data: any } & GetWithMetadataResult) | null>

  /* eslint-enable @typescript-eslint/no-explicit-any */

  async getWithMetadata(
    key: string,
    options: { type: 'stream' } & GetWithMetadataOptions,
  ): Promise<({ data: ReadableStream } & GetWithMetadataResult) | null>

  async getWithMetadata(
    key: string,
    options: { type: 'text' } & GetWithMetadataOptions,
  ): Promise<({ data: string } & GetWithMetadataResult) | null>

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

    if (res.status === 404) {
      return null
    }

    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res.status)
    }

    const responseETag = res?.headers.get('etag') ?? undefined
    const metadata = getMetadataFromResponse(res)
    const result: GetWithMetadataResult = {
      etag: responseETag,
      metadata,
    }

    if (res.status === 304 && requestETag) {
      return { data: null, ...result }
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

  list(options: ListOptions & { paginate: true }): AsyncIterable<ListResult>
  list(options?: ListOptions & { paginate?: false }): Promise<ListResult>
  list(options: ListOptions = {}): Promise<ListResult> | AsyncIterable<ListResult> {
    const iterator = this.getListIterator(options)

    if (options.paginate) {
      return iterator
    }

    // eslint-disable-next-line promise/prefer-await-to-then
    return collectIterator(iterator).then((items) =>
      items.reduce(
        (acc, item) => ({
          blobs: [...acc.blobs, ...item.blobs],
          directories: [...acc.directories, ...item.directories],
        }),
        { blobs: [], directories: [] },
      ),
    )
  }

  async set(key: string, data: BlobInput, { metadata }: SetOptions = {}) {
    Store.validateKey(key)

    const res = await this.client.makeRequest({
      body: data,
      key,
      metadata,
      method: HTTPMethod.PUT,
      storeName: this.name,
    })

    if (res.status !== 200) {
      throw new BlobsInternalError(res.status)
    }
  }

  async setJSON(key: string, data: unknown, { metadata }: SetOptions = {}) {
    Store.validateKey(key)

    const payload = JSON.stringify(data)
    const headers = {
      'content-type': 'application/json',
    }

    const res = await this.client.makeRequest({
      body: payload,
      headers,
      key,
      metadata,
      method: HTTPMethod.PUT,
      storeName: this.name,
    })

    if (res.status !== 200) {
      throw new BlobsInternalError(res.status)
    }
  }

  private static formatListResultBlob(result: ListResponseBlob): ListResultBlob | null {
    if (!result.key) {
      return null
    }

    return {
      etag: result.etag,
      key: result.key,
    }
  }

  private static validateKey(key: string) {
    if (key.startsWith('/') || key.startsWith('%2F')) {
      throw new Error('Blob key must not start with forward slash (/).')
    }

    if (Buffer.byteLength(key, 'utf8') > 600) {
      throw new Error(
        'Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long.',
      )
    }
  }

  private static validateDeployID(deployID: string) {
    // We could be stricter here and require a length of 24 characters, but the
    // CLI currently uses a deploy of `0` when running Netlify Dev, since there
    // is no actual deploy at that point. Let's go with a more loose validation
    // logic here until we update the CLI.
    if (!/^\w{1,24}$/.test(deployID)) {
      throw new Error(`'${deployID}' is not a valid Netlify deploy ID.`)
    }
  }

  private static validateStoreName(name: string) {
    if (name.startsWith('deploy:') || name.startsWith('deploy%3A1')) {
      throw new Error('Store name must not start with the `deploy:` reserved keyword.')
    }

    if (name.includes('/') || name.includes('%2F')) {
      throw new Error('Store name must not contain forward slashes (/).')
    }

    if (Buffer.byteLength(name, 'utf8') > 64) {
      throw new Error(
        'Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long.',
      )
    }
  }

  private getListIterator(options?: ListOptions): AsyncIterable<ListResult> {
    const { client, name: storeName } = this
    const parameters: Record<string, string> = {}

    if (options?.prefix) {
      parameters.prefix = options.prefix
    }

    if (options?.directories) {
      parameters.directories = 'true'
    }

    return {
      [Symbol.asyncIterator]() {
        let currentCursor: string | null = null
        let done = false

        return {
          async next() {
            if (done) {
              return { done: true, value: undefined }
            }

            const nextParameters = { ...parameters }

            if (currentCursor !== null) {
              nextParameters.cursor = currentCursor
            }

            const res = await client.makeRequest({
              method: HTTPMethod.GET,
              parameters: nextParameters,
              storeName,
            })
            const page = (await res.json()) as ListResponse

            if (page.next_cursor) {
              currentCursor = page.next_cursor
            } else {
              done = true
            }

            const blobs = (page.blobs ?? []).map(Store.formatListResultBlob).filter(Boolean) as ListResponseBlob[]

            return {
              done: false,
              value: {
                blobs,
                directories: page.directories ?? [],
              },
            }
          },
        }
      },
    }
  }
}
