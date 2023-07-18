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

const siteID = '12345'
const key = '54321'
const value = 'some value'
const apiToken = 'some token'
const signedURL = 'https://signed.url/123456789'

describe('get', () => {
  test('Reads from the blob store using API credentials', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('get')

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

  test('Returns `null` when the pre-signed URL returns a 404', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('get')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        return new Response('Something went wrong', { status: 404 })
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

    expect(await blobs.get(key)).toBeNull()
  })

  test('Throws when the API returns a non-200 status code', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('get')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(null, { status: 401, statusText: 'Unauthorized' })
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

    expect(async () => await blobs.get(key)).rejects.toThrowError(
      'get operation has failed: API returned a 401 response',
    )
  })

  test('Throws when a pre-signed URL returns a non-200 status code', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('get')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        return new Response('Something went wrong', { status: 401 })
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

    expect(async () => await blobs.get(key)).rejects.toThrowError('get operation has failed: Something went wrong')
  })

  test('Returns `null` when the blob entry contains an expiry date in the past', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('get')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        return new Response(value, {
          headers: {
            'x-nf-expires-at': (Date.now() - 1000).toString(),
          },
        })
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

    expect(await blobs.get(key)).toBeNull()
  })
})

describe('set', () => {
  test('Writes to the blob store using API credentials', async () => {
    expect.assertions(5)

    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('put')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        expect(options?.body).toBe(value)
        expect(headers['cache-control']).toBe('max-age=0, stale-while-revalidate=60')

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

    await blobs.set(key, value)
  })

  test('Accepts a TTL parameter', async () => {
    expect.assertions(6)

    const ttl = new Date(Date.now() + 15_000)
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('put')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        expect(options?.body).toBe(value)
        expect(headers['cache-control']).toBe('max-age=0, stale-while-revalidate=60')
        expect(headers['x-nf-expires-at']).toBe(ttl.getTime().toString())

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

    await blobs.set(key, value, { ttl })
  })

  test('Throws when a pre-signed URL returns a non-200 status code', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('put')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        return new Response('Something went wrong', { status: 401 })
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

    expect(async () => await blobs.set(key, 'value')).rejects.toThrowError(
      'put operation has failed: Something went wrong',
    )
  })
})

describe('delete', () => {
  test('Deletes from the blob store using API credentials', async () => {
    expect.assertions(4)

    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('delete')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        expect(options?.body).toBeUndefined()

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

    await blobs.delete(key)
  })

  test('Throws when a pre-signed URL returns a non-200 status code', async () => {
    const fetcher = async (...args: Parameters<typeof globalThis.fetch>) => {
      const [url, options] = args
      const headers = options?.headers as Record<string, string>

      expect(options?.method).toBe('delete')

      if (url === `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`) {
        const data = JSON.stringify({ url: signedURL })

        expect(headers.authorization).toBe(`Bearer ${apiToken}`)

        return new Response(data)
      }

      if (url === signedURL) {
        return new Response('Something went wrong', { status: 401 })
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

    expect(async () => await blobs.delete(key)).rejects.toThrowError(
      'delete operation has failed: Something went wrong',
    )
  })
})
