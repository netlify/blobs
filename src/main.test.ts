import { describe, test, expect } from 'vitest'

import { Blobs } from './main.js'

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

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?environment=production`) {
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

    expect(await val.text()).toBe(value)
  })
})
