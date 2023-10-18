import { Buffer } from 'node:buffer'

export type Metadata = Record<string, unknown>

const BASE64_PREFIX = 'b64;'
export const METADATA_HEADER_INTERNAL = 'x-amz-meta-user'
export const METADATA_HEADER_EXTERNAL = 'netlify-blobs-metadata'
const METADATA_MAX_SIZE = 2 * 1024

export const encodeMetadata = (metadata: Metadata) => {
  const encodedObject = Buffer.from(JSON.stringify(metadata)).toString('base64')
  const payload = `b64;${encodedObject}`

  if (METADATA_HEADER_EXTERNAL.length + payload.length > METADATA_MAX_SIZE) {
    throw new Error('Metadata object exceeds the maximum size')
  }

  return payload
}

export const decodeMetadata = (headers?: Headers): Metadata => {
  if (!headers) {
    return {}
  }

  const metadataHeader = headers.get(METADATA_HEADER_INTERNAL)

  if (!metadataHeader || !metadataHeader.startsWith(BASE64_PREFIX)) {
    return {}
  }

  const encodedData = metadataHeader.slice(BASE64_PREFIX.length)
  const decodedData = Buffer.from(encodedData, 'base64').toString()
  const metadata = JSON.parse(decodedData)

  return metadata
}
