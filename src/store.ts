import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import pMap from 'p-map'

import { Client, Context } from './client.js'
import { BlobInput, HTTPMethod } from './types.js'

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
  expiration?: Date | number
}

interface SetFilesItem extends SetOptions {
  key: string
  path: string
}

interface SetFilesOptions {
  concurrency?: number
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
    await this.client.makeRequest({ key, method: HTTPMethod.Delete, storeName: this.name })
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
    const res = await this.client.makeRequest({ key, method: HTTPMethod.Get, storeName: this.name })
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
      method: HTTPMethod.Put,
      storeName: this.name,
    })
  }

  async setFile(key: string, path: string, { expiration }: SetOptions = {}) {
    const { size } = await stat(path)
    const file = Readable.toWeb(createReadStream(path))
    const headers = {
      ...Store.getExpirationHeaders(expiration),
      'content-length': size.toString(),
    }

    await this.client.makeRequest({
      body: file as ReadableStream,
      headers,
      key,
      method: HTTPMethod.Put,
      storeName: this.name,
    })
  }

  setFiles(files: SetFilesItem[], { concurrency = 5 }: SetFilesOptions = {}) {
    return pMap(files, ({ key, path, ...options }) => this.setFile(key, path, options), { concurrency })
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
      method: HTTPMethod.Put,
      storeName: this.name,
    })
  }
}

interface GetDeployStoreOptions extends Context {
  deployID: string
}

interface GetNamedStoreOptions extends Context {
  name: string
}

export const getStore: {
  (name: string): Store
  (options: GetDeployStoreOptions | GetNamedStoreOptions): Store
} = (input) => {
  if (typeof input === 'string') {
    const client = new Client()

    return new Store({ client, name: input })
  }

  if ('deployID' in input) {
    const { deployID, ...context } = input
    const client = new Client(context)

    return new Store({ client, name: deployID })
  }

  const { name, ...context } = input
  const client = new Client(context)

  return new Store({ client, name })
}
