import { promises as fs } from 'node:fs'
import { env, version as nodeVersion } from 'node:process'

import semver from 'semver'
import tmp from 'tmp-promise'
import { test, expect, beforeAll, afterEach } from 'vitest'

import { getDeployStore, getStore } from './main.js'
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
const token = 'my-very-secret-token'

test('Reads and writes from the file system', async () => {
  const metadata = {
    features: {
      blobs: true,
      functions: true,
    },
    name: 'Netlify',
  }

  // Store #1: Edge access
  const server1Ops: string[] = []
  const directory1 = await tmp.dir()
  const server1 = new BlobsServer({
    directory: directory1.path,
    onRequest: ({ type }) => server1Ops.push(type),
    token,
  })

  const { port: port1 } = await server1.start()
  const store1 = getStore({
    edgeURL: `http://localhost:${port1}`,
    name: 'mystore1',
    token,
    siteID,
  })

  // Store #2: API access
  const directory2 = await tmp.dir()
  const server2 = new BlobsServer({
    directory: directory2.path,
    token,
  })
  const { port: port2 } = await server2.start()
  const store2 = getStore({
    apiURL: `http://localhost:${port2}`,
    name: 'mystore2',
    token,
    siteID,
  })

  for (const store of [store1, store2]) {
    const list1 = await store.list()
    expect(list1.blobs).toEqual([])
    expect(list1.directories).toEqual([])

    await store.set('simple-key', 'value 1')
    expect(await store.get('simple-key')).toBe('value 1')

    await store.set('simple-key', 'value 2', { metadata })
    expect(await store.get('simple-key')).toBe('value 2')

    const list2 = await store.list()
    expect(list2.blobs.length).toBe(1)
    expect(list2.blobs[0].key).toBe('simple-key')
    expect(list2.directories).toEqual([])

    await store.set('parent/child', 'value 3')
    expect(await store.get('parent/child')).toBe('value 3')
    expect(await store.get('parent')).toBe(null)

    const entry = await store.getWithMetadata('simple-key')
    expect(entry?.metadata).toEqual(metadata)

    const entryMetadata = await store.getMetadata('simple-key')
    expect(entryMetadata?.metadata).toEqual(metadata)

    const childEntryMetdata = await store.getMetadata('parent/child')
    expect(childEntryMetdata?.metadata).toEqual({})

    expect(await store.getWithMetadata('does-not-exist')).toBe(null)
    expect(await store.getMetadata('does-not-exist')).toBe(null)

    await store.delete('simple-key')
    expect(await store.get('simple-key')).toBe(null)
    expect(await store.getMetadata('simple-key')).toBe(null)
    expect(await store.getWithMetadata('simple-key')).toBe(null)

    const list3 = await store.list()
    expect(list3.blobs.length).toBe(1)
    expect(list3.blobs[0].key).toBe('parent/child')
    expect(list3.directories).toEqual([])
  }

  expect(server1Ops).toEqual([
    'list',
    'set',
    'get',
    'set',
    'get',
    'list',
    'set',
    'get',
    'get',
    'get',
    'getMetadata',
    'getMetadata',
    'get',
    'getMetadata',
    'delete',
    'get',
    'getMetadata',
    'get',
    'list',
  ])

  await server1.stop()
  await fs.rm(directory1.path, { force: true, recursive: true })

  await server2.stop()
  await fs.rm(directory2.path, { force: true, recursive: true })
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
  const key = 'my-key'

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

  await expect(async () => await blobs.get('some-key')).rejects.toThrowError(
    'Netlify Blobs has generated an internal error: 403 response',
  )

  await server.stop()
  await fs.rm(directory.path, { force: true, recursive: true })
})

test('Lists entries', async () => {
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
  const songs: Record<string, string> = {
    'coldplay/parachutes/shiver': "I'll always be waiting for you",
    'coldplay/parachutes/spies': 'And the spies came out of the water',
    'coldplay/parachutes/trouble': 'And I:I never meant to cause you trouble',
    'coldplay/a-rush-of-blood-to-the-head/politik': 'Give me heart and give me soul',
    'coldplay/a-rush-of-blood-to-the-head/in-my-place': 'How long must you wait for it?',
    'coldplay/a-rush-of-blood-to-the-head/the-scientist': 'Questions of science, science and progress',
    'phoenix/united/too-young': "Oh rainfalls and hard times coming they won't leave me tonight",
    'phoenix/united/party-time': 'Summertime is gone',
    'phoenix/ti-amo/j-boy': 'Something in the middle of the side of the store',
    'phoenix/ti-amo/fleur-de-lys': 'No rest till I get to you, no rest till I get to you',
  }

  for (const title in songs) {
    await blobs.set(title, songs[title])
  }

  const allSongs = await blobs.list()

  for (const title in songs) {
    const match = allSongs.blobs.find((blob) => blob.key === title)

    expect(match).toBeTruthy()
  }

  const coldplaySongs = await blobs.list({ prefix: 'coldplay/' })

  for (const title in songs) {
    if (!title.startsWith('coldplay/')) {
      continue
    }

    const match = coldplaySongs.blobs.find((blob) => blob.key === title)

    expect(match).toBeTruthy()
  }

  const parachutesSongs = await blobs.list({ prefix: 'coldplay/parachutes/' })

  for (const title in songs) {
    if (!title.startsWith('coldplay/parachutes/')) {
      continue
    }

    const match = parachutesSongs.blobs.find((blob) => blob.key === title)

    expect(match).toBeTruthy()
  }

  const fooFightersSongs = await blobs.list({ prefix: 'foo-fighters/' })

  expect(fooFightersSongs.blobs).toEqual([])

  const artists = await blobs.list({ directories: true })

  expect(artists.blobs).toEqual([])
  expect(artists.directories).toEqual(['coldplay', 'phoenix'])

  const coldplayAlbums = await blobs.list({ directories: true, prefix: 'coldplay/' })

  expect(coldplayAlbums.blobs).toEqual([])
  expect(coldplayAlbums.directories).toEqual(['coldplay/a-rush-of-blood-to-the-head', 'coldplay/parachutes'])

  const parachutesSongs2 = await blobs.list({ directories: true, prefix: 'coldplay/parachutes/' })

  for (const title in songs) {
    if (!title.startsWith('coldplay/parachutes/')) {
      continue
    }

    const match = parachutesSongs2.blobs.find((blob) => blob.key === title)

    expect(match).toBeTruthy()
  }

  expect(parachutesSongs2.directories).toEqual([])
})

test('Works with a deploy-scoped store', async () => {
  const deployID = '655f77a1b48f470008e5879a'
  const directory = await tmp.dir()
  const server = new BlobsServer({
    directory: directory.path,
    token,
  })
  const { port } = await server.start()

  const store = getDeployStore({
    deployID,
    edgeURL: `http://localhost:${port}`,
    token,
    siteID,
  })
  const key = 'my-key'

  await store.set(key, 'value 1 for store 1')

  expect(await store.get(key)).toBe('value 1 for store 1')

  await server.stop()
  await fs.rm(directory.path, { force: true, recursive: true })
})
