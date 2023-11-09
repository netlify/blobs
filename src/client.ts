import { EnvironmentContext, getEnvironmentContext, MissingBlobsEnvironmentError } from './environment.ts'
import { encodeMetadata, Metadata, METADATA_HEADER_EXTERNAL, METADATA_HEADER_INTERNAL } from './metadata.ts'
import { fetchAndRetry } from './retry.ts'
import { BlobInput, Fetcher, HTTPMethod } from './types.ts'

interface MakeStoreRequestOptions {
  body?: BlobInput | null
  headers?: Record<string, string>
  key?: string
  metadata?: Metadata
  method: HTTPMethod
  parameters?: Record<string, string>
  storeName: string
}

export interface ClientOptions {
  apiURL?: string
  edgeURL?: string
  fetch?: Fetcher
  siteID: string
  token: string
}

interface GetFinalRequestOptions {
  key: string | undefined
  metadata?: Metadata
  method: string
  parameters?: Record<string, string>
  storeName: string
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

  private async getFinalRequest({ key, metadata, method, parameters = {}, storeName }: GetFinalRequestOptions) {
    const encodedMetadata = encodeMetadata(metadata)

    if (this.edgeURL) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.token}`,
      }

      if (encodedMetadata) {
        headers[METADATA_HEADER_EXTERNAL] = encodedMetadata
      }

      let path = `/${this.siteID}/${storeName}/${key}`

      // If there is no key, we're dealing with the list endpoint, which is
      // implemented directly in the Netlify API, which can be accessed from
      // the edge with a special path pattern.
      if (key === undefined) {
        path = `/api/v1/sites/${this.siteID}/blobs/`
        parameters['context'] = storeName
      }

      const url = new URL(path, this.edgeURL)

      for (const key in parameters) {
        url.searchParams.set(key, parameters[key])
      }

      return {
        headers,
        url: url.toString(),
      }
    }

    const apiHeaders: Record<string, string> = { authorization: `Bearer ${this.token}` }
    const url = new URL(`/api/v1/sites/${this.siteID}/blobs`, this.apiURL ?? 'https://api.netlify.com')

    for (const key in parameters) {
      url.searchParams.set(key, parameters[key])
    }

    url.searchParams.set('context', storeName)

    // If there is no key, we're dealing with the list endpoint, which is
    // implemented directly in the Netlify API.
    if (key === undefined) {
      return {
        headers: apiHeaders,
        url: url.toString(),
      }
    }

    url.pathname += `/${key}`

    if (encodedMetadata) {
      apiHeaders[METADATA_HEADER_EXTERNAL] = encodedMetadata
    }

    // HEAD requests are implemented directly in the Netlify API.
    if (method === HTTPMethod.HEAD) {
      return {
        headers: apiHeaders,
        url: url.toString(),
      }
    }

    const res = await this.fetch(url.toString(), { headers: apiHeaders, method })

    if (res.status !== 200) {
      throw new Error(`Netlify Blobs has generated an internal error: ${res.status} response`)
    }

    const { url: signedURL } = await res.json()
    const userHeaders = encodedMetadata ? { [METADATA_HEADER_INTERNAL]: encodedMetadata } : undefined

    return {
      headers: userHeaders,
      url: signedURL,
    }
  }

  async makeRequest({
    body,
    headers: extraHeaders,
    key,
    metadata,
    method,
    parameters,
    storeName,
  }: MakeStoreRequestOptions) {
    const { headers: baseHeaders = {}, url } = await this.getFinalRequest({
      key,
      metadata,
      method,
      parameters,
      storeName,
    })
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

    return fetchAndRetry(this.fetch, url, options)
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
