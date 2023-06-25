[![Build](https://github.com/netlify/blobs-client/workflows/Build/badge.svg)](https://github.com/netlify/blobs-client/actions)
[![Node](https://img.shields.io/node/v/@netlify/blobs.svg?logo=node.js)](https://www.npmjs.com/package/@netlify/blobs)

# @netlify/blobs

A JavaScript client for the Netlify Blob Store.

## Installation

You can install Netlify Blobs via npm:

```shell
npm install @netlify/blobs
```

## Usage

To use the blob store, import the module and create an instance of the `Blobs` class. The constructor accepts an object with the following properties:

| Property        | Description                                               | Default Value |
|-----------------|-----------------------------------------------------------|---------------|
| `authentication` | An object containing authentication credentials           | N/A        |
| `environment`    | A string representing the environment                     | `'production'`|
| `fetcher`        | An implementation of a fetch-compatible module            | `globalThis.fetch`       |
| `siteID`        | A string representing the ID of the Netlify site          | N/A        |

### Example

```javascript
import { Blobs } from "@netlify/blobs";

const store = new Blobs({
  authentication: {
    token: 'YOUR_NETLIFY_AUTH_TOKEN'
  },
  siteID: 'YOUR_NETLIFY_SITE_ID'
});

const item = await store.get("some-key");

console.log(await item.json());
```

## API

### `get(key: string): Promise<Response | null>`

Retrieves an object with the given key.

If an object with the given key is found, a [standard `Response` object](https://developer.mozilla.org/en-US/docs/Web/API/Response) is returned, allowing you to use methods like `.json()`, `.text()`, or `.blob()` to read the underlying value.

Otherwise, `null` is returned.

```javascript
const entry = await blobs.get('some-key');

console.log(await entry.text());
```

### `set(key: string, value: ReadableStream | string | ArrayBuffer | Blob): Promise<void>`

Creates an object with the given key and value.

If an entry with the given key already exists, its value is overwritten.

```javascript
await blobs.set('some-key', 'This is a string value');
```

### `setJSON(key: string, value: any): Promise<void>`

Convenience method for creating a JSON-serialized object with the given key.

If an entry with the given key already exists, its value is overwritten.

```javascript
await blobs.setJSON('some-key', {
  foo: "bar"
});
```

### `delete(key: string): Promise<void>`

Deletes an object with the given key, if one exists.

```javascript
await blobs.delete('my-key');
```

## Contributing

Contributions are welcome! If you encounter any issues or have suggestions for improvements, please open an issue or submit a pull request on the [GitHub repository](https://github.com/example/netlify-blobs).

## License

Netlify Blobs is open-source software licensed under the [MIT license](https://github.com/example/netlify-blobs/blob/main/LICENSE).
