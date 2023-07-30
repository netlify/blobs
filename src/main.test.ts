import { writeFile } from 'node:fs/promises'
import { version as nodeVersion } from 'node:process'

import semver from 'semver'
import tmp from 'tmp-promise'
import { describe, test, expect, beforeAll } from 'vitest'

import { MockFetch } from '../test/mock_fetch.js'
import { streamToString } from '../test/util.js'

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
const edgeToken = 'some other token'
const edgeURL = 'https://cloudfront.url'

describe('get', () => {
  test('Reads from the blob store using API credentials', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    const string = await blobs.get(key)
    expect(string).toBe(value)

    const stream = await blobs.get(key, { type: 'stream' })
    expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Reads from the blob store using context credentials', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    const string = await blobs.get(key)
    expect(string).toBe(value)

    const stream = await blobs.get(key, { type: 'stream' })
    expect(await streamToString(stream as unknown as NodeJS.ReadableStream)).toBe(value)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Returns `null` when the pre-signed URL returns a 404', async () => {
    const store = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })
      .get({
        response: new Response('Something went wrong', { status: 404 }),
        url: signedURL,
      })

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    expect(await blobs.get(key)).toBeNull()
    expect(store.fulfilled).toBeTruthy()
  })

  test('Returns `null` when the edge URL returns a 404', async () => {
    const store = new MockFetch().get({
      headers: { authorization: `Bearer ${edgeToken}` },
      response: new Response(null, { status: 404 }),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    expect(await blobs.get(key)).toBeNull()
    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the API returns a non-200 status code', async () => {
    const store = new MockFetch().get({
      headers: { authorization: `Bearer ${apiToken}` },
      response: new Response(null, { status: 401 }),
      url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
    })

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    expect(async () => await blobs.get(key)).rejects.toThrowError(
      'get operation has failed: API returned a 401 response',
    )
    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when a pre-signed URL returns a non-200 status code', async () => {
    const store = new MockFetch()
      .get({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })
      .get({
        response: new Response('Something went wrong', { status: 401 }),
        url: signedURL,
      })

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await expect(async () => await blobs.get(key)).rejects.toThrowError(
      'get operation has failed: store returned a 401 response',
    )

    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when an edge URL returns a non-200 status code', async () => {
    const store = new MockFetch().get({
      headers: { authorization: `Bearer ${edgeToken}` },
      response: new Response(null, { status: 401 }),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await expect(async () => await blobs.get(key)).rejects.toThrowError(
      'get operation has failed: store returned a 401 response',
    )

    expect(store.fulfilled).toBeTruthy()
  })

  test('Returns `null` when the blob entry contains an expiry date in the past', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    expect(await blobs.get(key)).toBeNull()
    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetcher } = new MockFetch()

    const blobs1 = new Blobs({
      authentication: {
        token: '',
      },
      fetcher,
      siteID,
    })

    const blobs2 = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher,
      siteID: '',
    })

    expect(async () => await blobs1.get(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
    expect(async () => await blobs2.get(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
  })
})

describe('set', () => {
  test('Writes to the blob store using API credentials', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.set(key, value)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Writes to the blob store using context credentials', async () => {
    const store = new MockFetch().put({
      body: value,
      headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
      response: new Response(null),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.set(key, value)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Accepts an `expiration` parameter', async () => {
    const expiration = new Date(Date.now() + 15_000)
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.set(key, value, { expiration })

    expect(store.fulfilled).toBeTruthy()
  })

  // We need `Readable.toWeb` to be available, which needs Node 16+.
  if (semver.gte(nodeVersion, '16.0.0')) {
    test('Accepts a file', async () => {
      const fileContents = 'Hello from a file'
      const store = new MockFetch()
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

      const { cleanup, path } = await tmp.file()

      await writeFile(path, fileContents)

      const blobs = new Blobs({
        authentication: {
          token: apiToken,
        },
        fetcher: store.fetcher,
        siteID,
      })

      await blobs.setFile(key, path)

      expect(store.fulfilled).toBeTruthy()

      await cleanup()
    })

    test('Accepts multiple files concurrently', async () => {
      const contents = ['Hello from key-0', 'Hello from key-1', 'Hello from key-2']
      const signedURLs = ['https://signed-url.aws/0', 'https://signed-url.aws/1', 'https://signed-url.aws/2']

      const store = new MockFetch()
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

      const blobs = new Blobs({
        authentication: {
          token: apiToken,
        },
        fetcher: store.fetcher,
        siteID,
      })

      await blobs.setFiles(files)

      expect(store.fulfilled).toBeTruthy()

      await Promise.all(writes.map(({ cleanup }) => cleanup()))
    })
  }

  test('Throws when the API returns a non-200 status code', async () => {
    const store = new MockFetch().put({
      headers: { authorization: `Bearer ${apiToken}` },
      response: new Response(null, { status: 401 }),
      url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
    })

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    expect(async () => await blobs.set(key, 'value')).rejects.toThrowError(
      'put operation has failed: API returned a 401 response',
    )
    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the edge URL returns a non-200 status code', async () => {
    const store = new MockFetch().put({
      body: value,
      headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
      response: new Response(null, { status: 401 }),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await expect(async () => await blobs.set(key, value)).rejects.toThrowError(
      'put operation has failed: store returned a 401 response',
    )

    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetcher } = new MockFetch()

    const blobs1 = new Blobs({
      authentication: {
        token: '',
      },
      fetcher,
      siteID,
    })

    const blobs2 = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher,
      siteID: '',
    })

    expect(async () => await blobs1.set(key, value)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
    expect(async () => await blobs2.set(key, value)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
  })

  test('Retries failed operations when using API credentials', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.set(key, value)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Retries failed operations when using context credentials', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.set(key, value)

    expect(store.fulfilled).toBeTruthy()
  })
})

describe('setJSON', () => {
  test('Writes to the blob store using API credentials', async () => {
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.setJSON(key, { value })

    expect(store.fulfilled).toBeTruthy()
  })

  test('Writes to the blob store using context credentials', async () => {
    const store = new MockFetch().put({
      body: JSON.stringify({ value }),
      headers: { authorization: `Bearer ${edgeToken}`, 'cache-control': 'max-age=0, stale-while-revalidate=60' },
      response: new Response(null),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.setJSON(key, { value })

    expect(store.fulfilled).toBeTruthy()
  })

  test('Accepts an `expiration` parameter', async () => {
    const expiration = new Date(Date.now() + 15_000)
    const store = new MockFetch()
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

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.setJSON(key, { value }, { expiration })

    expect(store.fulfilled).toBeTruthy()
  })
})

describe('delete', () => {
  test('Deletes from the blob store using API credentials', async () => {
    const store = new MockFetch()
      .delete({
        headers: { authorization: `Bearer ${apiToken}` },
        response: new Response(JSON.stringify({ url: signedURL })),
        url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
      })
      .delete({
        response: new Response(null),
        url: signedURL,
      })

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.delete(key)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Deletes from the blob store using context credentials', async () => {
    const store = new MockFetch().delete({
      headers: { authorization: `Bearer ${edgeToken}` },
      response: new Response(null),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await blobs.delete(key)

    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the API returns a non-200 status code', async () => {
    const store = new MockFetch().delete({
      headers: { authorization: `Bearer ${apiToken}` },
      response: new Response(null, { status: 401 }),
      url: `https://api.netlify.com/api/v1/sites/${siteID}/blobs/${key}?context=production`,
    })

    const blobs = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    expect(async () => await blobs.delete(key)).rejects.toThrowError(
      'delete operation has failed: API returned a 401 response',
    )
    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the edge URL returns a non-200 status code', async () => {
    const store = new MockFetch().delete({
      headers: { authorization: `Bearer ${edgeToken}` },
      response: new Response(null, { status: 401 }),
      url: `${edgeURL}/${siteID}/production/${key}`,
    })

    const blobs = new Blobs({
      authentication: {
        contextURL: edgeURL,
        token: edgeToken,
      },
      fetcher: store.fetcher,
      siteID,
    })

    await expect(async () => await blobs.delete(key)).rejects.toThrowError(
      'delete operation has failed: store returned a 401 response',
    )

    expect(store.fulfilled).toBeTruthy()
  })

  test('Throws when the instance is missing required configuration properties', async () => {
    const { fetcher } = new MockFetch()

    const blobs1 = new Blobs({
      authentication: {
        token: '',
      },
      fetcher,
      siteID,
    })

    const blobs2 = new Blobs({
      authentication: {
        token: apiToken,
      },
      fetcher,
      siteID: '',
    })

    expect(async () => await blobs1.delete(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
    expect(async () => await blobs2.delete(key)).rejects.toThrowError(
      `The blob store is unavailable because it's missing required configuration properties`,
    )
  })
})
