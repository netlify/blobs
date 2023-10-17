import { Client, ClientOptions } from './client.ts'
import { getEnvironmentContext, MissingBlobsEnvironmentError } from './environment.ts'
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

class Store {
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

export const getDeployStore = (options: Partial<ClientOptions> = {}): Store => {
  const context = getEnvironmentContext()
  const { deployID, ...contextOptions } = context
  const clientOptions = {
    ...contextOptions,
    ...options,
    siteID: options.siteID ?? context.siteID,
    token: options.token ?? context.token,
  }

  if (!deployID || !clientOptions.siteID || !clientOptions.token) {
    throw new MissingBlobsEnvironmentError(['deployID', 'siteID', 'token'])
  }

  const client = new Client(clientOptions as ClientOptions)

  return new Store({ client, deployID })
}

interface GetStoreOptions extends Partial<ClientOptions> {
  deployID?: string
  name?: string
}

export const getStore: {
  (name: string): Store
  (options: GetStoreOptions): Store
} = (input) => {
  const context = getEnvironmentContext()

  if (typeof input === 'string') {
    if (!context.siteID || !context.token) {
      throw new MissingBlobsEnvironmentError(['siteID', 'token'])
    }

    const client = new Client({
      apiURL: context.apiURL,
      edgeURL: context.edgeURL,
      siteID: context.siteID,
      token: context.token,
    })

    return new Store({ client, name: input })
  }

  if (typeof input.name === 'string') {
    const { name, ...options } = input
    const clientOptions = {
      ...context,
      ...options,
      siteID: options.siteID ?? context.siteID,
      token: options.token ?? context.token,
    }

    if (!clientOptions.siteID || !clientOptions.token) {
      throw new MissingBlobsEnvironmentError(['siteID', 'token'])
    }

    const client = new Client(clientOptions as ClientOptions)

    return new Store({ client, name })
  }

  if (typeof input.deployID === 'string') {
    const { deployID, name, ...options } = input
    const clientOptions = {
      ...context,
      ...options,
      siteID: options.siteID ?? context.siteID,
      token: options.token ?? context.token,
    }

    if (!clientOptions.siteID || !clientOptions.token) {
      throw new MissingBlobsEnvironmentError(['siteID', 'token'])
    }

    const client = new Client(clientOptions as ClientOptions)

    return new Store({ client, deployID })
  }

  throw new Error('`getStore()` requires a `name` or `siteID` properties.')
}
