import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { env, version as nodeVersion } from 'node:process'

import semver from 'semver'
import tmp from 'tmp-promise'
import { describe, test, expect, beforeAll, afterEach } from 'vitest'

import { MockFetch } from '../test/mock_fetch.js'
import { streamToString } from '../test/util.js'

import { getStore } from './main.js'

beforeAll(async () => {
  if (semver.lt(nodeVersion, '18.0.0')) {
    const nodeFetch = await import('node-fetch')

    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.fetch = nodeFetch.default
    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.Request = nodeFetch.Request
    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.Response = nodeFetch.Response
    // @ts-expect-error Expected type mismatch between native implementation and node-fetch
    globalThis.Headers = nodeFetch.Headers
  }
})

afterEach(() => {
  delete env.NETLIFY_BLOBS_CONTEXT
})

const deployID = '6527dfab35be400008332a1d'
const siteID = '9a003659-aaaa-0000-aaaa-63d3720d8621'
const key = '54321'
const complexKey = '/artista/canção'
const value = 'some value'
const apiToken = 'some token'
const signedURL = 'https://signed.url/123456789'
const edgeToken = 'some other token'
const edgeURL = 'https://cloudfront.url'

describe('get', () => {
  describe('With API credentials', () => {
    test('Reads from the blob store', async () => {
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response(value),
          url: signedURL,
        })
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response(value),
          url: signedURL,
        })
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${encodeURIComponent(
            complexKey,
          )}?context=production`,
        })
        .get({
          response: new Response(value),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      const string = await blobs.get(key)
      expect(string).toBe(value)

      const stream = await blobs.get(key, { type: 'stream' })
      expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

      const string2 = await blobs.get(complexKey)
      expect(string2).toBe(value)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Returns `null` when the pre-signed URL returns a 404', async () => {
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response('Something went wrong', { status: 404 }),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(await blobs.get(key)).toBeNull()
      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the API returns a non-200 status code', async () => {
      const mockStore = new MockFetch().get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(null, { status: 401 }),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.get(key)).rejects.toThrowError(
        'get operation has failed: API returned a 401 response',
      )
      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when a pre-signed URL returns a non-200 status code', async () => {
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response('Something went wrong', { status: 401 }),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await expect(async () => await blobs.get(key)).rejects.toThrowError(
        'get operation has failed: store returned a 401 response',
      )

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Returns `null` when the blob entry contains an expiry date in the past', async () => {
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response(value, {
            headers: {
              'x-nf-expires-at': (Date.now() - 1000).toString(),
            },
          }),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(await blobs.get(key)).toBeNull()
      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  describe('With edge credentials', () => {
    test('Reads from the blob store', async () => {
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${edgeToken}` },
          response: new Response(value),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })
        .get({
          headers: { authorization: `Bearer ${edgeToken}` },
          response: new Response(value),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      const string = await blobs.get(key)
      expect(string).toBe(value)

      const stream = await blobs.get(key, { type: 'stream' })
      expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Returns `null` when the edge URL returns a 404', async () => {
      const mockStore = new MockFetch().get({
        headers: { authorization: `Bearer ${edgeToken}` },
        response: new Response(null, { status: 404 }),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      expect(await blobs.get(key)).toBeNull()
      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when an edge URL returns a non-200 status code', async () => {
      const mockStore = new MockFetch().get({
        headers: { authorization: `Bearer ${edgeToken}` },
        response: new Response(null, { status: 401 }),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await expect(async () => await blobs.get(key)).rejects.toThrowError(
        'get operation has failed: store returned a 401 response',
      )

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Loads credentials from the environment', async () => {
      const tokens = ['some-token-1', 'another-token-2']
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${tokens[0]}` },
          response: new Response(value),
          url: `${edgeURL}/${siteID}/images/${key}`,
        })
        .get({
          headers: { authorization: `Bearer ${tokens[0]}` },
          response: new Response(value),
          url: `${edgeURL}/${siteID}/images/${key}`,
        })
        .get({
          headers: { authorization: `Bearer ${tokens[1]}` },
          response: new Response(value),
          url: `${edgeURL}/${siteID}/images/${key}`,
        })
        .get({
          headers: { authorization: `Bearer ${tokens[1]}` },
          response: new Response(value),
          url: `${edgeURL}/${siteID}/images/${key}`,
        })

      globalThis.fetch = mockStore.fetcher

      for (let index = 0; index <= 1; index++) {
        const context = {
          edgeURL,
          siteID,
          token: tokens[index],
        }

        env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

        const store = getStore('images')

        const string = await store.get(key)
        expect(string).toBe(value)

        const stream = await store.get(key, { type: 'stream' })
        expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)
      }

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetcher } = new MockFetch()

    globalThis.fetch = fetcher

    const blobs1 = getStore('production')

    expect(async () => await blobs1.get(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )

    const blobs2 = getStore({
      name: 'production',
      token: apiToken,
      siteID: '',
    })

    expect(async () => await blobs2.get(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
  })
})

describe('set', () => {
  describe('With API credentials', () => {
    test('Writes to the blob store', async () => {
      const mockStore = new MockFetch()
        .put({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .put({
          body: value,
          headers: { 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null),
          url: signedURL,
        })
        .put({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${encodeURIComponent(
            complexKey,
          )}?context=production`,
        })
        .put({
          body: value,
          headers: { 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.set(key, value)
      await blobs.set(complexKey, value)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Accepts an `expiration` parameter', async () => {
      const expiration = new Date(Date.now() + 15_000)
      const mockStore = new MockFetch()
        .put({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .put({
          body: value,
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
            'x-nf-expires-at': expiration.getTime().toString(),
          },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.set(key, value, { expiration })

      expect(mockStore.fulfilled).toBeTruthy()
    })

    // We need `Readable.toWeb` to be available, which needs Node 16+.
    if (semver.gte(nodeVersion, '16.0.0')) {
      test('Accepts a file', async () => {
        const fileContents = 'Hello from a file'
        const mockStore = new MockFetch()
          .put({
            headers: { authorization: `Bearer ${apiToken}` },
            response: new Response(JSON.stringify({ url: signedURL })),
            url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
          })
          .put({
            body: async (body) => {
              expect(await streamToString(body as unknown as NodeJS.ReadableStream)).toBe(fileContents)
            },
            headers: {
              'cache-control': 'max-age=0, stale-while-revalidate=60',
            },
            response: new Response(null),
            url: signedURL,
          })

        globalThis.fetch = mockStore.fetcher

        const { cleanup, path } = await tmp.file()

        await writeFile(path, fileContents)

        const blobs = getStore({
          name: 'production',
          token: apiToken,
          siteID,
        })

        await blobs.setFile(key, path)

        expect(mockStore.fulfilled).toBeTruthy()

        await cleanup()
      })

      test('Accepts multiple files concurrently', async () => {
        const contents = ['Hello from key-0', 'Hello from key-1', 'Hello from key-2']
        const signedURLs = ['https://signed-url.aws/0', 'https://signed-url.aws/1', 'https://signed-url.aws/2']

        const mockStore = new MockFetch()
          .put({
            headers: { authorization: `Bearer ${apiToken}` },
            response: new Response(JSON.stringify({ url: signedURLs[0] })),
            url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/key-0?context=production`,
          })
          .put({
            body: async (body) => {
              expect(await streamToString(body as unknown as NodeJS.ReadableStream)).toBe(contents[0])
            },
            headers: {
              'cache-control': 'max-age=0, stale-while-revalidate=60',
            },
            response: new Response(null),
            url: signedURLs[0],
          })
          .put({
            headers: { authorization: `Bearer ${apiToken}` },
            response: new Response(JSON.stringify({ url: signedURLs[1] })),
            url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/key-1?context=production`,
          })
          .put({
            body: async (body) => {
              expect(await streamToString(body as unknown as NodeJS.ReadableStream)).toBe(contents[1])
            },
            headers: {
              'cache-control': 'max-age=0, stale-while-revalidate=60',
            },
            response: new Response(null),
            url: signedURLs[1],
          })
          .put({
            headers: { authorization: `Bearer ${apiToken}` },
            response: new Response(JSON.stringify({ url: signedURLs[2] })),
            url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/key-2?context=production`,
          })
          .put({
            body: async (body) => {
              expect(await streamToString(body as unknown as NodeJS.ReadableStream)).toBe(contents[2])
            },
            headers: {
              'cache-control': 'max-age=0, stale-while-revalidate=60',
            },
            response: new Response(null),
            url: signedURLs[2],
          })

        globalThis.fetch = mockStore.fetcher

        const writes = await Promise.all(
          contents.map(async (content) => {
            const { cleanup, path } = await tmp.file()

            await writeFile(path, content)

            return { cleanup, path }
          }),
        )
        const files = writes.map(({ path }, idx) => ({
          key: `key-${idx}`,
          path,
        }))

        const blobs = getStore({
          name: 'production',
          token: apiToken,
          siteID,
        })

        await blobs.setFiles(files)

        expect(mockStore.fulfilled).toBeTruthy()

        await Promise.all(writes.map(({ cleanup }) => cleanup()))
      })
    }

    test('Throws when the API returns a non-200 status code', async () => {
      const mockStore = new MockFetch().put({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(null, { status: 401 }),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.set(key, 'value')).rejects.toThrowError(
        'put operation has failed: API returned a 401 response',
      )
      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Retries failed operations', async () => {
      const mockStore = new MockFetch()
        .put({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .put({
          body: value,
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
          },
          response: new Response(null, { status: 500 }),
          url: signedURL,
        })
        .put({
          body: value,
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
          },
          response: new Error('Some network problem'),
          url: signedURL,
        })
        .put({
          body: value,
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
          },
          response: new Response(null, { headers: { 'X-RateLimit-Reset': '10' }, status: 429 }),
          url: signedURL,
        })
        .put({
          body: value,
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
          },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.set(key, value)

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  describe('With edge credentials', () => {
    test('Writes to the blob store', async () => {
      const mockStore = new MockFetch()
        .put({
          body: value,
          headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })
        .put({
          body: value,
          headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null),
          url: `${edgeURL}/${siteID}/production/${encodeURIComponent(complexKey)}`,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await blobs.set(key, value)
      await blobs.set(complexKey, value)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the edge URL returns a non-200 status code', async () => {
      const mockStore = new MockFetch().put({
        body: value,
        headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
        response: new Response(null, { status: 401 }),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await expect(async () => await blobs.set(key, value)).rejects.toThrowError(
        'put operation has failed: store returned a 401 response',
      )

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Retries failed operations', async () => {
      const mockStore = new MockFetch()
        .put({
          body: value,
          headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null, { status: 500 }),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })
        .put({
          body: value,
          headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Error('Some network problem'),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })
        .put({
          body: value,
          headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null, { headers: { 'X-RateLimit-Reset': '10' }, status: 429 }),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })
        .put({
          body: value,
          headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await blobs.set(key, value)

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetcher } = new MockFetch()

    globalThis.fetch = fetcher

    const blobs1 = getStore('production')

    expect(async () => await blobs1.set(key, value)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )

    const blobs2 = getStore({
      name: 'production',
      token: apiToken,
      siteID: '',
    })

    expect(async () => await blobs2.set(key, value)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
  })
})

describe('setJSON', () => {
  describe('With API credentials', () => {
    test('Writes to the blob store', async () => {
      const mockStore = new MockFetch()
        .put({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .put({
          body: JSON.stringify({ value }),
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
          },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.setJSON(key, { value })

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  describe('With edge credentials', () => {
    test('Writes to the blob store', async () => {
      const mockStore = new MockFetch().put({
        body: JSON.stringify({ value }),
        headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
        response: new Response(null),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await blobs.setJSON(key, { value })

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Accepts an `expiration` parameter', async () => {
      const expiration = new Date(Date.now() + 15_000)
      const mockStore = new MockFetch()
        .put({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .put({
          body: JSON.stringify({ value }),
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
            'x-nf-expires-at': expiration.getTime().toString(),
          },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.setJSON(key, { value }, { expiration })

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })
})

describe('delete', () => {
  describe('With API credentials', () => {
    test('Deletes from the blob store', async () => {
      const mockStore = new MockFetch()
        .delete({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .delete({
          response: new Response(null),
          url: signedURL,
        })
        .delete({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${encodeURIComponent(
            complexKey,
          )}?context=production`,
        })
        .delete({
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.delete(key)
      await blobs.delete(complexKey)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the API returns a non-200 status code', async () => {
      const mockStore = new MockFetch().delete({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(null, { status: 401 }),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.delete(key)).rejects.toThrowError(
        'delete operation has failed: API returned a 401 response',
      )
      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  describe('With edge credentials', () => {
    test('Deletes from the blob store', async () => {
      const mockStore = new MockFetch().delete({
        headers: { authorization: `Bearer ${edgeToken}` },
        response: new Response(null),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await blobs.delete(key)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the edge URL returns a non-200 status code', async () => {
      const mockStore = new MockFetch().delete({
        headers: { authorization: `Bearer ${edgeToken}` },
        response: new Response(null, { status: 401 }),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetcher

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await expect(async () => await blobs.delete(key)).rejects.toThrowError(
        'delete operation has failed: store returned a 401 response',
      )

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetcher } = new MockFetch()

    globalThis.fetch = fetcher

    const blobs1 = getStore('production')

    expect(async () => await blobs1.delete(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )

    const blobs2 = getStore({
      name: 'production',
      token: apiToken,
      siteID: '',
    })

    expect(async () => await blobs2.delete(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
  })
})

describe('Deploy scope', () => {
  test('Returns a deploy-scoped store if the `deployID` parameter is supplied', async () => {
    const mockToken = 'some-token'
    const mockStore = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/images/${key}`,
      })
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/images/${key}`,
      })
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/${deployID}/${key}`,
      })
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/${deployID}/${key}`,
      })

    globalThis.fetch = mockStore.fetcher

    const context = {
      edgeURL,
      siteID,
      token: mockToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    const siteStore = getStore('images')

    const string1 = await siteStore.get(key)
    expect(string1).toBe(value)

    const stream1 = await siteStore.get(key, { type: 'stream' })
    expect(await streamToString(stream1 as unknown as NodeJS.ReadableStream)).toBe(value)

    const deployStore = getStore({ deployID })

    const string2 = await deployStore.get(key)
    expect(string2).toBe(value)

    const stream2 = await deployStore.get(key, { type: 'stream' })
    expect(await streamToString(stream2 as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(mockStore.fulfilled).toBeTruthy()
  })
})
