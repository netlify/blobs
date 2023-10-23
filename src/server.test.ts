import { promises as fs } from 'node:fs'
import { env, version as nodeVersion } from 'node:process'

import semver from 'semver'
import tmp from 'tmp-promise'
import { describe, test, expect, beforeAll, afterEach } from 'vitest'

import { getStore } from './main.js'
import { BlobsServer } from './server.js'

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

const siteID = '9a003659-aaaa-0000-aaaa-63d3720d8621'
const key = '54321'
const token = 'my-very-secret-token'

describe('Local server', () => {
  test('Reads and writes from the file system', async () => {
    const directory = await tmp.dir()
    const server = new BlobsServer({
      directory: directory.path,
      token,
    })
    const { port } = await server.start()
    const blobs = getStore({
      edgeURL: `http://localhost:${port}`,
      name: 'mystore',
      token,
      siteID,
    })

    await blobs.set(key, 'value 1')
    expect(await blobs.get(key)).toBe('value 1')

    await blobs.set(key, 'value 2')
    expect(await blobs.get(key)).toBe('value 2')

    await blobs.delete(key)
    expect(await blobs.get(key)).toBe(null)

    await server.stop()
    await fs.rm(directory.path, { force: true, recursive: true })
  })

  test('Separates keys from different stores', async () => {
    const directory = await tmp.dir()
    const server = new BlobsServer({
      directory: directory.path,
      token,
    })
    const { port } = await server.start()

    const store1 = getStore({
      edgeURL: `http://localhost:${port}`,
      name: 'mystore1',
      token,
      siteID,
    })
    const store2 = getStore({
      edgeURL: `http://localhost:${port}`,
      name: 'mystore2',
      token,
      siteID,
    })

    await store1.set(key, 'value 1 for store 1')
    await store2.set(key, 'value 1 for store 2')

    expect(await store1.get(key)).toBe('value 1 for store 1')
    expect(await store2.get(key)).toBe('value 1 for store 2')

    await server.stop()
    await fs.rm(directory.path, { force: true, recursive: true })
  })

  test('If a token is set, rejects any requests with an invalid `authorization` header', async () => {
    const directory = await tmp.dir()
    const server = new BlobsServer({
      directory: directory.path,
      token,
    })
    const { port } = await server.start()
    const blobs = getStore({
      edgeURL: `http://localhost:${port}`,
      name: 'mystore',
      token: 'another token',
      siteID,
    })

    await expect(async () => await blobs.get(key)).rejects.toThrowError(
      'get operation has failed: store returned a 403 response',
    )

    await server.stop()
    await fs.rm(directory.path, { force: true, recursive: true })
  })
})
