import { fetchAndRetry } from './retry.ts'
import { BlobInput, Fetcher, HTTPMethod } from './types.ts'

interface MakeStoreRequestOptions {
  body?: BlobInput | null
  headers?: Record<string, string>
  key: string
  method: HTTPMethod
  storeName: string
}

export interface ClientOptions {
  apiURL?: string
  edgeURL?: string
  fetch?: Fetcher
  siteID: string
  token: string
}

export class Client {
  private apiURL?: string
  private edgeURL?: string
  private fetch?: Fetcher
  private siteID: string
  private token: string

  constructor({ apiURL, edgeURL, fetch, siteID, token }: ClientOptions) {
    this.apiURL = apiURL
    this.edgeURL = edgeURL
    this.fetch = fetch
    this.siteID = siteID
    this.token = token
  }

  private async getFinalRequest(storeName: string, key: string, method: string) {
    const encodedKey = encodeURIComponent(key)

    if (this.edgeURL) {
      return {
        headers: {
          authorization: `Bearer ${this.token}`,
        },
        url: `${this.edgeURL}/${this.siteID}/${storeName}/${encodedKey}`,
      }
    }

    const apiURL = `${this.apiURL ?? 'https://api.netlify.com'}/api/v1/sites/${
      this.siteID
    }/blobs/${encodedKey}?context=${storeName}`
    const headers = { authorization: `Bearer ${this.token}` }
    const fetch = this.fetch ?? globalThis.fetch
    const res = await fetch(apiURL, { headers, method })

    if (res.status !== 200) {
      throw new Error(`${method} operation has failed: API returned a ${res.status} response`)
    }

    const { url } = await res.json()

    return {
      url,
    }
  }

  async makeRequest({ body, headers: extraHeaders, key, method, storeName }: MakeStoreRequestOptions) {
    const { headers: baseHeaders = {}, url } = await this.getFinalRequest(storeName, key, method)
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...extraHeaders,
    }

    if (method === HTTPMethod.PUT) {
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

    const fetch = this.fetch ?? globalThis.fetch
    const res = await fetchAndRetry(fetch, url, options)

    if (res.status === 404 && method === HTTPMethod.GET) {
      return null
    }

    if (res.status !== 200) {
      throw new Error(`${method} operation has failed: store returned a ${res.status} response`)
    }

    return res
  }
}
