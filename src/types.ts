export type BlobInput = ReadableStream | string | ArrayBuffer | Blob

export type Fetcher = typeof globalThis.fetch

export enum HTTPMethod {
  Delete = 'delete',
  Get = 'get',
  Put = 'put',
}
