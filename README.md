[![Build](https://github.com/netlify/blobs/workflows/Build/badge.svg)](https://github.com/netlify/blobs/actions)
[![Node](https://img.shields.io/node/v/@netlify/blobs.svg?logo=node.js)](https://www.npmjs.com/package/@netlify/blobs)

# @netlify/blobs

A JavaScript client for the Netlify Blob Store.

## Installation

You can install `@netlify/blobs` via npm:

```shell
npm install @netlify/blobs
```

### Requirements

- Deno 1.30 and above or Node.js 16.0.0 and above
- `fetch` in the global scope with a [fetch-compatible](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
  interface

## Usage

To start reading and writing data, you must first get a reference to a store using the `getStore` method.

This method takes an options object that lets you configure the store for different access modes.

### API access

You can interact with the blob store through the [Netlify API](https://docs.netlify.com/api/get-started). This is the
recommended method if you're looking for a strong-consistency way of accessing data, where latency is not mission
critical (since requests will always go to a non-distributed origin).

Create a store for API access by calling `getStore` with the following parameters:

- `name` (string): Name of the store
- `siteID` (string): ID of the Netlify site
- `token` (string): [Personal access token](https://docs.netlify.com/api/get-started/#authentication) to access the
  Netlify API
- `apiURL` (string): URL of the Netlify API (optional, defaults to `https://api.netlify.com`)

```ts
import { getStore } from '@netlify/blobs'

const store = getStore({
  name: 'my-store',
  siteID: 'MY_SITE_ID',
  token: 'MY_TOKEN',
})

console.log(await store.get('some-key'))
```

### Edge access

You can also interact with the blob store using a distributed network that caches entries at the edge. This is the
recommended method if you're looking for fast reads across multiple locations, knowing that reads will be
eventually-consistent with a drift of up to 60 seconds.

Create a store for edge access by calling `getStore` with the following parameters:

- `name` (string): Name of the store
- `siteID` (string): ID of the Netlify site
- `token` (string): [Personal access token](https://docs.netlify.com/api/get-started/#authentication) to access the
  Netlify API
- `edgeURL` (string): URL of the edge endpoint

```ts
import { Buffer } from 'node:buffer'

import { getStore } from '@netlify/blobs'

// Serverless function using the Lambda compatibility mode
export const handler = async (event, context) => {
  const rawData = Buffer.from(context.clientContext.custom.blobs, 'base64')
  const data = JSON.parse(rawData.toString('ascii'))
  const store = getStore({
    edgeURL: data.url,
    name: 'my-store',
    token: data.token,
    siteID: 'MY_SITE_ID',
  })
  const item = await store.get('some-key')

  return {
    statusCode: 200,
    body: item,
  }
}
```

### Environment-based configuration

Rather than explicitly passing the configuration context to the `getStore` method, it can be read from the execution
environment. This is particularly useful for setups where the configuration data is held by one system and the data
needs to be accessed in another system, with no direct communication between the two.

To do this, the system that holds the configuration data should set an environment variable called `NETLIFY_BLOBS_1`
with a Base64-encoded, JSON-stringified representation of an object with the following properties:

- `apiURL` (optional) or `edgeURL`: URL of the Netlify API (for [API access](#api-access)) or the edge endpoint (for
  [Edge access](#edge-access))
- `token`: Access token for the corresponding access mode
- `siteID`: ID of the Netlify site

With this in place, the `getStore` method can be called just with the store name. No configuration object is required,
since it'll be read from the environment.

```ts
import { getStore } from '@netlify/blobs'

const store = getStore('my-store')

console.log(await store.get('my-key'))
```

### Deploy scope

By default, stores exist at the site level, which means that data can be read and written across different deploys and
deploy contexts. Users are responsible for managing that data, since the platform doesn't have enough information to
know whether an item is still relevant or safe to delete.

But sometimes it's useful to have data pegged to a specific deploy, and shift to the platform the responsibility of
managing that data — keep it as long as the deploy is around, and wipe it if the deploy is deleted.

You can opt-in to this behavior by supplying a `deployID` instead of a `name` to the `getStore` method.

```ts
import { assert } from 'node:assert'

import { getStore } from '@netlify/blobs'

// Using API access
const store1 = getStore({
  deployID: 'MY_DEPLOY_ID',
  token: 'MY_API_TOKEN',
})

await store1.set('my-key', 'my value')

// Using environment-based configuration
const store2 = getStore({
  deployID: 'MY_DEPLOY_ID',
})

assert.equal(await store2.get('my-key'), 'my value')
```

## Store API reference

### `get(key: string, { type: string }): Promise<any>`

Retrieves an object with the given key.

Depending on the most convenient format for you to access the value, you may choose to supply a `type` property as a
second parameter, with one of the following values:

- `arrayBuffer`: Returns the entry as an
  [`ArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer)
- `blob`: Returns the entry as a [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- `json`: Parses the entry as JSON and returns the resulting object
- `stream`: Returns the entry as a [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
- `text` (default): Returns the entry as a string of plain text

If an object with the given key is not found, `null` is returned.

```javascript
const entry = await blobs.get('some-key', { type: 'json' })

console.log(entry)
```

### `set(key: string, value: ArrayBuffer | Blob | ReadableStream | string): Promise<void>`

Creates an object with the given key and value.

If an entry with the given key already exists, its value is overwritten.

```javascript
await blobs.set('some-key', 'This is a string value')
```

### `setJSON(key: string, value: any): Promise<void>`

Convenience method for creating a JSON-serialized object with the given key.

If an entry with the given key already exists, its value is overwritten.

```javascript
await blobs.setJSON('some-key', {
  foo: 'bar',
})
```

### `delete(key: string): Promise<void>`

Deletes an object with the given key, if one exists.

```javascript
await blobs.delete('my-key')
```

## Contributing

Contributions are welcome! If you encounter any issues or have suggestions for improvements, please open an issue or
submit a pull request on the [GitHub repository](https://github.com/example/netlify-blobs).

## License

Netlify Blobs is open-source software licensed under the
[MIT license](https://github.com/example/netlify-blobs/blob/main/LICENSE).
