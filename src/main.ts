import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

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

type BlobInput = ReadableStream | string | ArrayBuffer | Blob

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
    } else if (globalThis.fetch !== undefined) {
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
        url: `${this.authentication.contextURL}/${this.siteID}:${this.context}:${key}`,
      }
    }

    const apiURL = `${this.authentication.apiURL}/api/v1/sites/${this.siteID}/blobs/${key}?context=${this.context}`
    const headers = { authorization: `Bearer ${this.authentication.token}` }
    const res = await this.fetcher(apiURL, { headers, method })
    const { url } = await res.json()

    return {
      method: finalMethod,
      url,
    }
  }

  private async makeStoreRequest(
    key: string,
    method: HTTPMethod,
    extraHeaders?: Record<string, string>,
    body?: BlobInput | null,
  ) {
    const { headers: baseHeaders = {}, method: finalMethod, url } = await this.getFinalRequest(key, method)
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...extraHeaders,
    }

    if (method === HTTPMethod.Put) {
      headers['cache-control'] = 'max-age=0, stale-while-revalidate=60'
    }

    return await this.fetcher(url, { body, headers, method: finalMethod })
  }

  async delete(key: string) {
    return await this.makeStoreRequest(key, HTTPMethod.Delete)
  }

  async get(key: string, metadata?: Record<string, string>) {
    const res = await this.makeStoreRequest(key, HTTPMethod.Get)

    if (res.status === 200) {
      return new Response(await res.blob())
    }

    if (res.status === 404) {
      return null
    }

    throw new Error(`Unexpected response from the blob store: ${res.status}`)
  }

  async set(key: string, data: BlobInput) {
    await this.makeStoreRequest(key, HTTPMethod.Put, {}, data)
  }

  async setJSON(key: string, data: unknown) {
    const payload = JSON.stringify(data)
    const headers = {
      'content-type': 'application/json',
    }

    await this.makeStoreRequest(key, HTTPMethod.Put, headers, payload)
  }
}
