import { version as nodeVersion } from 'process'

import semver from 'semver'

import { describe, test, expect, beforeAll } from 'vitest'

import { Blobs } from './main.js'

beforeAll(async () => {
  if (semver.lt(nodeVersion, '18.0.0')) {
    const nodeFetch = await import('node-fetch')

    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.fetch = nodeFetch.default
    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.Request = nodeFetch.Request
    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.Response = nodeFetch.Response
    globalThis.Headers = nodeFetch.Headers
  }
})

describe('With API credentials', () => {
  test('Reads a key from the blob store', async () => {
    const siteID = '12345'
    const key = '54321'
    const value = 'some value'
    const apiToken = 'some token'
    const signedURL = 'https://signed.url/123456789'

    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        return new Response(value)
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    }

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher,
      siteID,
    })
    const val = await blobs.get(key)

    expect(val).toBe(value)
  })
})
