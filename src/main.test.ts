import { Buffer } from 'node:buffer'
import { env, version as nodeVersion } from 'node:process'

import semver from 'semver'
import { describe, test, expect, beforeAll, afterEach } from 'vitest'

import { MockFetch } from '../test/mock_fetch.js'
import { base64Encode, streamToString } from '../test/util.js'

import { MissingBlobsEnvironmentError } from './environment.js'
import { getDeployStore, getStore } from './main.js'

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
const complexKey = 'artist/song'
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
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${complexKey}?context=production`,
        })
        .get({
          response: new Response(value),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.get(key)).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await expect(async () => await blobs.get(key)).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
      )

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

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await expect(async () => await blobs.get(key)).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
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

      globalThis.fetch = mockStore.fetch

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
})

describe('getWithMetadata', () => {
  describe('With API credentials', () => {
    test('Reads from the blob store and returns the etag and the metadata object', async () => {
      const mockMetadata = {
        name: 'Netlify',
        cool: true,
        functions: ['edge', 'serverless'],
      }
      const responseHeaders = {
        etag: '123456789',
        'x-amz-meta-user': `b64;${base64Encode(mockMetadata)}`,
      }
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response(value, { headers: responseHeaders }),
          url: signedURL,
        })
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response(value, { headers: responseHeaders }),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      const entry1 = await blobs.getWithMetadata(key)
      expect(entry1.data).toBe(value)
      expect(entry1.etag).toBe(responseHeaders.etag)
      expect(entry1.metadata).toEqual(mockMetadata)

      const entry2 = await blobs.getWithMetadata(key, { type: 'stream' })
      expect(await streamToString(entry2.data as unknown as NodeJS.ReadableStream)).toBe(value)
      expect(entry2.etag).toBe(responseHeaders.etag)
      expect(entry2.metadata).toEqual(mockMetadata)

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(await blobs.getWithMetadata(key)).toBeNull()
      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the metadata object cannot be parsed', async () => {
      const responseHeaders = {
        etag: '123456789',
        'x-amz-meta-user': `b64;${base64Encode(`{"name": "Netlify", "cool`)}`,
      }
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          response: new Response(value, { headers: responseHeaders }),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await expect(async () => await blobs.getWithMetadata(key)).rejects.toThrowError(
        'An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client.',
      )

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Supports conditional requests', async () => {
      const mockMetadata = {
        name: 'Netlify',
        cool: true,
        functions: ['edge', 'serverless'],
      }
      const etags = ['"thewrongetag"', '"therightetag"']
      const metadataHeaders = {
        'x-amz-meta-user': `b64;${base64Encode(mockMetadata)}`,
      }
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: `${signedURL}b` })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          headers: { 'if-none-match': etags[0] },
          response: new Response(value, { headers: { ...metadataHeaders, etag: etags[0] }, status: 200 }),
          url: `${signedURL}b`,
        })
        .get({
          headers: { authorization: `Bearer ${apiToken}` },
          response: new Response(JSON.stringify({ url: `${signedURL}a` })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .get({
          headers: { 'if-none-match': etags[1] },
          response: new Response(null, { headers: { ...metadataHeaders, etag: etags[0] }, status: 304 }),
          url: `${signedURL}a`,
        })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      const staleEntry = await blobs.getWithMetadata(key, { etag: etags[0] })
      expect(staleEntry.data).toBe(value)
      expect(staleEntry.etag).toBe(etags[0])
      expect(staleEntry.fresh).toBe(false)
      expect(staleEntry.metadata).toEqual(mockMetadata)

      const freshEntry = await blobs.getWithMetadata(key, { etag: etags[1], type: 'text' })
      expect(freshEntry.data).toBe(null)
      expect(freshEntry.etag).toBe(etags[0])
      expect(freshEntry.fresh).toBe(true)
      expect(freshEntry.metadata).toEqual(mockMetadata)

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })

  describe('With edge credentials', () => {
    test('Reads from the blob store and returns the etag and the metadata object', async () => {
      const mockMetadata = {
        name: 'Netlify',
        cool: true,
        functions: ['edge', 'serverless'],
      }
      const responseHeaders = {
        etag: '123456789',
        'x-amz-meta-user': `b64;${base64Encode(mockMetadata)}`,
      }
      const mockStore = new MockFetch()
        .get({
          headers: { authorization: `Bearer ${edgeToken}` },
          response: new Response(value, { headers: responseHeaders }),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })
        .get({
          headers: { authorization: `Bearer ${edgeToken}` },
          response: new Response(value, { headers: responseHeaders }),
          url: `${edgeURL}/${siteID}/production/${key}`,
        })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      const entry1 = await blobs.getWithMetadata(key)
      expect(entry1.data).toBe(value)
      expect(entry1.etag).toBe(responseHeaders.etag)
      expect(entry1.metadata).toEqual(mockMetadata)

      const entry2 = await blobs.getWithMetadata(key, { type: 'stream' })
      expect(await streamToString(entry2.data as unknown as NodeJS.ReadableStream)).toBe(value)
      expect(entry2.etag).toBe(responseHeaders.etag)
      expect(entry2.metadata).toEqual(mockMetadata)

      expect(mockStore.fulfilled).toBeTruthy()
    })
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
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${complexKey}?context=production`,
        })
        .put({
          body: value,
          headers: { 'cache-control': 'max-age=0, stale-while-revalidate=60' },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.set(key, value)
      await blobs.set(complexKey, value)

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Accepts a `metadata` parameter', async () => {
      const metadata = {
        name: 'Netlify',
        cool: true,
        functions: ['edge', 'serverless'],
      }
      const encodedMetadata = `b64;${Buffer.from(JSON.stringify(metadata)).toString('base64')}`
      const mockStore = new MockFetch()
        .put({
          headers: { authorization: `Bearer ${apiToken}`, 'netlify-blobs-metadata': encodedMetadata },
          response: new Response(JSON.stringify({ url: signedURL })),
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
        })
        .put({
          body: value,
          headers: {
            'cache-control': 'max-age=0, stale-while-revalidate=60',
            'x-amz-meta-user': encodedMetadata,
          },
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      await blobs.set(key, value, { metadata })

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the API returns a non-200 status code', async () => {
      const mockStore = new MockFetch().put({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(null, { status: 401 }),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.set(key, 'value')).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
      )
      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the key fails validation', async () => {
      const mockStore = new MockFetch()

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.set('/key', 'value')).rejects.toThrowError(
        'Blob key must not start with forward slash (/).',
      )
      expect(async () => await blobs.set('a'.repeat(801), 'value')).rejects.toThrowError(
        'Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long.',
      )
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

      globalThis.fetch = mockStore.fetch

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
          url: `${edgeURL}/${siteID}/production/${complexKey}`,
        })

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await expect(async () => await blobs.set(key, value)).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
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

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await blobs.setJSON(key, { value })

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Accepts a `metadata` parameter', async () => {
      const metadata = {
        name: 'Netlify',
        cool: true,
        functions: ['edge', 'serverless'],
      }
      const encodedMetadata = `b64;${Buffer.from(JSON.stringify(metadata)).toString('base64')}`
      const mockStore = new MockFetch().put({
        body: JSON.stringify({ value }),
        headers: {
          authorization: `Bearer ${edgeToken}`,
          'cache-control': 'max-age=0, stale-while-revalidate=60',
          'netlify-blobs-metadata': encodedMetadata,
        },
        response: new Response(null),
        url: `${edgeURL}/${siteID}/production/${key}`,
      })

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await blobs.setJSON(key, { value }, { metadata })

      expect(mockStore.fulfilled).toBeTruthy()
    })

    test('Throws when the `metadata` parameter is above the size limit', async () => {
      const metadata = {
        name: 'Netlify'.repeat(1000),
      }
      const mockStore = new MockFetch()

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      expect(async () => await blobs.setJSON(key, { value }, { metadata })).rejects.toThrowError(
        'Metadata object exceeds the maximum size',
      )
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
          url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${complexKey}?context=production`,
        })
        .delete({
          response: new Response(null),
          url: signedURL,
        })

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        name: 'production',
        token: apiToken,
        siteID,
      })

      expect(async () => await blobs.delete(key)).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
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

      globalThis.fetch = mockStore.fetch

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

      globalThis.fetch = mockStore.fetch

      const blobs = getStore({
        edgeURL,
        name: 'production',
        token: edgeToken,
        siteID,
      })

      await expect(async () => await blobs.delete(key)).rejects.toThrowError(
        `Netlify Blobs has generated an internal error: 401 response`,
      )

      expect(mockStore.fulfilled).toBeTruthy()
    })
  })
})

describe('Deploy scope', () => {
  test('Returns a deploy-scoped store if the `deployID` parameter is supplied and the environment context is present', async () => {
    const mockToken = 'some-token'
    const mockStore = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/deploy:${deployID}/${key}`,
      })
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/deploy:${deployID}/${key}`,
      })

    globalThis.fetch = mockStore.fetch

    const context = {
      edgeURL,
      siteID,
      token: mockToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    const deployStore = getStore({ deployID })

    const string = await deployStore.get(key)
    expect(string).toBe(value)

    const stream = await deployStore.get(key, { type: 'stream' })
    expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(mockStore.fulfilled).toBeTruthy()
  })

  test('Returns a deploy-scoped store if the `deployID` parameter is supplied and the environment context is not present', async () => {
    const mockStore = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=deploy%3A${deployID}`,
      })
      .get({
        response: new Response(value),
        url: signedURL,
      })
      .get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=deploy%3A${deployID}`,
      })
      .get({
        response: new Response(value),
        url: signedURL,
      })

    globalThis.fetch = mockStore.fetch

    const deployStore = getStore({ deployID, siteID, token: apiToken })

    const string = await deployStore.get(key)
    expect(string).toBe(value)

    const stream = await deployStore.get(key, { type: 'stream' })
    expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(mockStore.fulfilled).toBeTruthy()
  })

  test('Returns a deploy-scoped store if the `getDeployStore` method is called and the environment context is present', async () => {
    const mockToken = 'some-token'
    const mockStore = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/deploy:${deployID}/${key}`,
      })
      .get({
        headers: { authorization: `Bearer ${mockToken}` },
        response: new Response(value),
        url: `${edgeURL}/${siteID}/deploy:${deployID}/${key}`,
      })

    globalThis.fetch = mockStore.fetch

    const context = {
      deployID,
      edgeURL,
      siteID,
      token: mockToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    const deployStore = getDeployStore()

    const string = await deployStore.get(key)
    expect(string).toBe(value)

    const stream = await deployStore.get(key, { type: 'stream' })
    expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(mockStore.fulfilled).toBeTruthy()
  })

  test('Returns a deploy-scoped store if the `getDeployStore` method is called and the environment context is not present', async () => {
    const mockStore = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=deploy%3A${deployID}`,
      })
      .get({
        response: new Response(value),
        url: signedURL,
      })
      .get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=deploy%3A${deployID}`,
      })
      .get({
        response: new Response(value),
        url: signedURL,
      })

    globalThis.fetch = mockStore.fetch

    const deployStore = getDeployStore({ deployID, siteID, token: apiToken })

    const string = await deployStore.get(key)
    expect(string).toBe(value)

    const stream = await deployStore.get(key, { type: 'stream' })
    expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(mockStore.fulfilled).toBeTruthy()
  })

  test('Throws if the deploy ID fails validation', async () => {
    const mockToken = 'some-token'
    const mockStore = new MockFetch()
    const longDeployID = 'd'.repeat(80)

    globalThis.fetch = mockStore.fetch

    expect(() => getDeployStore({ deployID: 'deploy/ID', siteID, token: apiToken })).toThrowError(
      `'deploy/ID' is not a valid Netlify deploy ID`,
    )
    expect(() => getStore({ deployID: 'deploy/ID', siteID, token: apiToken })).toThrowError(
      `'deploy/ID' is not a valid Netlify deploy ID`,
    )
    expect(() => getStore({ deployID: longDeployID, siteID, token: apiToken })).toThrowError(
      `'${longDeployID}' is not a valid Netlify deploy ID`,
    )

    const context = {
      deployID: 'uhoh!',
      edgeURL,
      siteID,
      token: mockToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    expect(() => getDeployStore()).toThrowError(`'uhoh!' is not a valid Netlify deploy ID`)
  })
})

describe('Custom `fetch`', () => {
  test('Uses a custom implementation of `fetch` if the `fetch` parameter is supplied', async () => {
    globalThis.fetch = () => {
      throw new Error('I should not be called')
    }

    const mockToken = 'some-token'
    const mockStore = new MockFetch().get({
      headers: { authorization: `Bearer ${mockToken}` },
      response: new Response(value),
      url: `${edgeURL}/${siteID}/images/${key}`,
    })
    const context = {
      edgeURL,
      siteID,
      token: mockToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    const store = getStore({ fetch: mockStore.fetch, name: 'images' })

    const string = await store.get(key)
    expect(string).toBe(value)

    expect(mockStore.fulfilled).toBeTruthy()
  })
})

describe(`getStore`, () => {
  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetch } = new MockFetch()

    globalThis.fetch = fetch

    expect(() => getStore('production')).toThrowError(MissingBlobsEnvironmentError)
    expect(() =>
      getStore({
        name: 'production',
        token: apiToken,
        siteID: '',
      }),
    ).toThrowError(MissingBlobsEnvironmentError)
  })

  test('Throws when the name of the store is not provided', async () => {
    const { fetch } = new MockFetch()

    globalThis.fetch = fetch

    // @ts-expect-error Ignoring types, which expect an argument
    expect(() => getStore()).toThrowError(
      'The `getStore` method requires the name of the store as a string or as the `name` property of an options object',
    )

    expect(() =>
      getStore({
        token: apiToken,
        siteID,
      }),
    ).toThrowError(
      'The `getStore` method requires the name of the store as a string or as the `name` property of an options object',
    )
  })

  test('Throws when the name of the store fails validation', async () => {
    const { fetch } = new MockFetch()

    globalThis.fetch = fetch

    expect(() =>
      getStore({
        name: 'some/store',
        token: apiToken,
        siteID,
      }),
    ).toThrowError(`Store name must not contain forward slashes (/).`)

    expect(() =>
      getStore({
        name: 'a'.repeat(70),
        token: apiToken,
        siteID,
      }),
    ).toThrowError(`Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long.`)

    expect(() =>
      getStore({
        name: 'deploy:foo',
        token: apiToken,
        siteID,
      }),
    ).toThrowError('Store name must not start with the `deploy:` reserved keyword.')

    const context = {
      siteID,
      token: apiToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    expect(() => getStore('deploy:foo')).toThrowError('Store name must not start with the `deploy:` reserved keyword.')
  })

  test('Throws when there is no `fetch` implementation available', async () => {
    // @ts-expect-error Assigning a value that doesn't match the type.
    globalThis.fetch = undefined

    const context = {
      siteID,
      token: apiToken,
    }

    env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString('base64')

    expect(() => getStore('production')).toThrowError(
      'Netlify Blobs could not find a `fetch` client in the global scope. You can either update your runtime to a version that includes `fetch` (like Node.js 18.0.0 or above), or you can supply your own implementation using the `fetch` property.',
    )
  })
})
