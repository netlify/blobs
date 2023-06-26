[![Build](https://github.com/netlify/blobs/workflows/Build/badge.svg)](https://github.com/netlify/blobs/actions)
[![Node](https://img.shields.io/node/v/@netlify/blobs.svg?logo=node.js)](https://www.npmjs.com/package/@netlify/blobs)

# @netlify/blobs

A JavaScript client for the Netlify Blob Store.

## Installation

You can install `@netlify/blobs` via npm:

```shell
npm install @netlify/blobs
```

## Usage

To use the blob store, import the module and create an instance of the `Blobs` class. The constructor accepts an object
with the following properties:

| Property         | Description                                                                                                                                                            | Required |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `authentication` | An object containing authentication credentials (see [Authentication](#authentication))                                                                                | **Yes**  |
| `siteID`         | The Netlify site ID                                                                                                                                                    | **Yes**  |
| `context`        | The [deploy context](https://docs.netlify.com/site-deploys/overview/#deploy-contexts) to use (defaults to `production`)                                                | No       |
| `fetcher`        | An implementation of a [fetch-compatible](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) module for making HTTP requests (defaults to `globalThis.fetch`) | No       |

### Example

```javascript
import assert from 'node:assert'
import { Blobs } from '@netlify/blobs'

const store = new Blobs({
  authentication: {
    token: 'YOUR_NETLIFY_AUTH_TOKEN',
  },
  siteID: 'YOUR_NETLIFY_SITE_ID',
})

await store.set('some-key', 'Hello!')

const item = await store.get('some-key')

assert.strictEqual(item, 'Hello!')
```

### Authentication

Authentication with the blob storage is done in one of two ways:

- Using a [Netlify API token](https://docs.netlify.com/api/get-started/#authentication)

  ```javascript
  import { Blobs } from '@netlify/blobs'

  const store = new Blobs({
    authentication: {
      token: 'YOUR_NETLIFY_API_TOKEN',
    },
    siteID: 'YOUR_NETLIFY_SITE_ID',
  })
  ```

- Using a context object injected in Netlify Functions

  ```javascript
  import { Blobs } from '@netlify/blobs'
  import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'

  export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    const store = new Blobs({
      authentication: {
        contextURL: context.blobs.url,
        token: context.blobs.token,
      },
      siteID: 'YOUR_NETLIFY_SITE_ID',
    })
  }
  ```

## API

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
