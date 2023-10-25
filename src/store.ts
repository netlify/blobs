import { ListResponse, ListResponseBlob } from './backend/list.ts'
import { Client } from './client.ts'
import { decodeMetadata, Metadata } from './metadata.ts'
import { BlobInput, HTTPMethod } from './types.ts'
import { BlobsInternalError } from './util.ts'

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

interface ListResult {
  blobs: ListResultBlob[]
}

interface ListResultWithDirectories extends ListResult {
  directories: string[]
}

interface ListResultBlob {
  etag: string
  key: string
}

interface ListOptions {
  cursor?: string
  directories?: boolean
  paginate?: boolean
  prefix?: string
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
      Store.validateDeployID(options.deployID)

      this.name = `deploy:${options.deployID}`
    } else {
      Store.validateStoreName(options.name)

      this.name = options.name
    }
  }

  async delete(key: string) {
    const res = await this.client.makeRequest({ key, method: HTTPMethod.DELETE, storeName: this.name })

    if (res.status !== 200 && res.status !== 404) {
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

    if (res.status === 404) {
      return null
    }

    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res.status)
    }

    const responseETag = res?.headers.get('etag') ?? undefined

    let metadata: Metadata = {}

    try {
      metadata = decodeMetadata(res?.headers)
    } catch {
      throw new Error(
        'An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client.',
      )
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

  async list(options: ListOptions & { directories: true }): Promise<ListResultWithDirectories>
  async list(options?: ListOptions & { directories?: false }): Promise<ListResult>
  async list(options: ListOptions = {}): Promise<ListResult | ListResultWithDirectories> {
    const cursor = options.paginate === false ? options.cursor : undefined
    const maxPages = options.paginate === false ? 1 : Number.POSITIVE_INFINITY
    const res = await this.listAndPaginate({
      currentPage: 1,
      directories: options.directories,
      maxPages,
      nextCursor: cursor,
      prefix: options.prefix,
    })
    const blobs = res.blobs?.map(Store.formatListResultBlob).filter(Boolean) as ListResultBlob[]

    if (options?.directories) {
      return {
        blobs,
        directories: res.directories?.filter(Boolean) as string[],
      }
    }

    return {
      blobs,
    }
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
    if (key.startsWith('/') || !/^[\w%!.*'()/-]{1,600}$/.test(key)) {
      throw new Error(
        "Keys can only contain letters, numbers, percentage signs (%), exclamation marks (!), dots (.), asterisks (*), single quotes ('), parentheses (()), dashes (-) and underscores (_) up to a maximum of 600 characters. Keys can also contain forward slashes (/), but must not start with one.",
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
    if (name.startsWith('deploy:')) {
      throw new Error('Store name cannot start with the string `deploy:`, which is a reserved namespace.')
    }

    if (!/^[\w%!.*'()-]{1,64}$/.test(name)) {
      throw new Error(
        "Store name can only contain letters, numbers, percentage signs (%), exclamation marks (!), dots (.), asterisks (*), single quotes ('), parentheses (()), dashes (-) and underscores (_) up to a maximum of 64 characters.",
      )
    }
  }

  private async listAndPaginate(options: {
    accumulator?: ListResponse
    directories?: boolean
    currentPage: number
    maxPages: number
    nextCursor?: string
    prefix?: string
  }): Promise<ListResponse> {
    const {
      accumulator = { blobs: [], directories: [] },
      currentPage,
      directories,
      maxPages,
      nextCursor,
      prefix,
    } = options

    if (currentPage > maxPages || (currentPage > 1 && !nextCursor)) {
      return accumulator
    }

    const parameters: Record<string, string> = {}

    if (nextCursor) {
      parameters.cursor = nextCursor
    }

    if (prefix) {
      parameters.prefix = prefix
    }

    if (directories) {
      parameters.directories = 'true'
    }

    const res = await this.client.makeRequest({
      method: HTTPMethod.GET,
      parameters,
      storeName: this.name,
    })

    if (res.status !== 200) {
      throw new BlobsInternalError(res.status)
    }

    try {
      const current = (await res.json()) as ListResponse
      const newAccumulator = {
        ...current,
        blobs: [...(accumulator.blobs || []), ...(current.blobs || [])],
        directories: [...(accumulator.directories || []), ...(current.directories || [])],
      }

      return this.listAndPaginate({
        accumulator: newAccumulator,
        currentPage: currentPage + 1,
        directories,
        maxPages,
        nextCursor: current.next_cursor,
      })
    } catch (error: unknown) {
      throw new Error(`'list()' has returned an internal error: ${error}`)
    }
  }
}
