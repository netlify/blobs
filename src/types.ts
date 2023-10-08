export type BlobInput = ReadableStream | string | ArrayBuffer | Blob

export enum HTTPMethod {
  Delete = 'delete',
  Get = 'get',
  Put = 'put',
}
