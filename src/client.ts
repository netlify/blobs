import { EnvironmentContext, getEnvironmentContext, MissingBlobsEnvironmentError } from './environment.ts'
import { encodeMetadata, Metadata, METADATA_HEADER_EXTERNAL, METADATA_HEADER_INTERNAL } from './metadata.ts'
import { fetchAndRetry } from './retry.ts'
import { BlobInput, Fetcher, HTTPMethod } from './types.ts'

interface MakeStoreRequestOptions {
  body?: BlobInput | null
  headers?: Record<string, string>
  key: string
  metadata?: Metadata
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
  private fetch: Fetcher
  private siteID: string
  private token: string

  constructor({ apiURL, edgeURL, fetch, siteID, token }: ClientOptions) {
    this.apiURL = apiURL
    this.edgeURL = edgeURL
    this.fetch = fetch ?? globalThis.fetch
    this.siteID = siteID
    this.token = token

    if (!this.fetch) {
      throw new Error(
        'Netlify Blobs could not find a `fetch` client in the global scope. You can either update your runtime to a version that includes `fetch` (like Node.js 18.0.0 or above), or you can supply your own implementation using the `fetch` property.',
      )
    }
  }

  private async getFinalRequest(storeName: string, key: string, method: string, metadata?: Metadata) {
    const encodedMetadata = encodeMetadata(metadata)

    if (this.edgeURL) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.token}`,
      }

      if (encodedMetadata) {
        headers[METADATA_HEADER_EXTERNAL] = encodedMetadata
      }

      return {
        headers,
        url: `${this.edgeURL}/${this.siteID}/${storeName}/${key}`,
      }
    }

    const apiURL = `${this.apiURL ?? 'https://api.netlify.com'}/api/v1/sites/${
      this.siteID
    }/blobs/${key}?context=${storeName}`
    const apiHeaders: Record<string, string> = { authorization: `Bearer ${this.token}` }

    if (encodedMetadata) {
      apiHeaders[METADATA_HEADER_EXTERNAL] = encodedMetadata
    }

    const res = await this.fetch(apiURL, { headers: apiHeaders, method })

    if (res.status !== 200) {
      throw new Error(`${method} operation has failed: API returned a ${res.status} response`)
    }

    const { url } = await res.json()
    const userHeaders = encodedMetadata ? { [METADATA_HEADER_INTERNAL]: encodedMetadata } : undefined

    return {
      headers: userHeaders,
      url,
    }
  }

  async makeRequest({ body, headers: extraHeaders, key, metadata, method, storeName }: MakeStoreRequestOptions) {
    const { headers: baseHeaders = {}, url } = await this.getFinalRequest(storeName, key, method, metadata)
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

    const res = await fetchAndRetry(this.fetch, url, options)

    if (res.status === 404 && method === HTTPMethod.GET) {
      return null
    }

    if (res.status !== 200 && res.status !== 304) {
      throw new Error(`${method} operation has failed: store returned a ${res.status} response`)
    }

    return res
  }
}

/**
 * Merges a set of options supplied by the user when getting a reference to a
 * store with a context object found in the environment.
 *
 * @param options User-supplied options
 * @param contextOverride Context to be used instead of the environment object
 */
export const getClientOptions = (
  options: Partial<ClientOptions>,
  contextOverride?: EnvironmentContext,
): ClientOptions => {
  const context = contextOverride ?? getEnvironmentContext()
  const siteID = context.siteID ?? options.siteID
  const token = context.token ?? options.token

  if (!siteID || !token) {
    throw new MissingBlobsEnvironmentError(['siteID', 'token'])
  }

  const clientOptions = {
    apiURL: context.apiURL ?? options.apiURL,
    edgeURL: context.edgeURL ?? options.edgeURL,
    fetch: options.fetch,
    siteID,
    token,
  }

  return clientOptions
}
