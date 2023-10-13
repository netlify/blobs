export type BlobInput = ReadableStream | string | ArrayBuffer | Blob

export type Fetcher = typeof globalThis.fetch

export enum HTTPMethod {
  DELETE = 'delete',
  GET = 'get',
  PUT = 'put',
}
