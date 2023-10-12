import { Buffer } from 'node:buffer'
import { env } from 'node:process'

import { fetchAndRetry } from './retry.ts'
import { BlobInput, HTTPMethod } from './types.ts'

// The name of the environment variable that holds the context in a Base64,
// JSON-encoded object. If we ever need to change the encoding or the shape
// of this object, we should bump the version and create a new variable, so
// that the client knows how to consume the data and can advise the user to
// update the client if needed.
export const NETLIFY_CONTEXT_VARIABLE = 'NETLIFY_BLOBS_CONTEXT'

export interface Context {
  apiURL?: string
  edgeURL?: string
  siteID: string
  token: string
}

interface MakeStoreRequestOptions {
  body?: BlobInput | null
  headers?: Record<string, string>
  key: string
  method: HTTPMethod
  storeName: string
}

export class Client {
  private context?: Context

  constructor(context?: Context) {
    this.context = context
  }

  private getContext() {
    if (this.context) {
      return this.context
    }

    if (!env[NETLIFY_CONTEXT_VARIABLE]) {
      return
    }

    const data = Buffer.from(env[NETLIFY_CONTEXT_VARIABLE], 'base64').toString()

    try {
      return JSON.parse(data) as Context
    } catch {
      // no-op
    }
  }

  private static async getFinalRequest(context: Context, storeName: string, key: string, method: string) {
    const encodedKey = encodeURIComponent(key)

    if ('edgeURL' in context) {
      return {
        headers: {
          authorization: `Bearer ${context.token}`,
        },
        url: `${context.edgeURL}/${context.siteID}/${storeName}/${encodedKey}`,
      }
    }

    const apiURL = `${context.apiURL ?? 'https://api.netlify.com'}/api/v1/sites/${
      context.siteID
    }/blobs/${encodedKey}?context=${storeName}`
    const headers = { authorization: `Bearer ${context.token}` }
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
    const context = this.getContext()

    if (!context || !context.token || !context.siteID) {
      throw new Error("The blob store is unavailable because it's missing required configuration properties")
    }

    const { headers: baseHeaders = {}, url } = await Client.getFinalRequest(context, storeName, key, method)
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...extraHeaders,
    }

    if (method === HTTPMethod.Put) {
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

    const res = await fetchAndRetry(url, options)

    if (res.status === 404 && method === HTTPMethod.Get) {
      return null
    }

    if (res.status !== 200) {
      throw new Error(`${method} operation has failed: store returned a ${res.status} response`)
    }

    return res
  }
}
