export class BlobsInternalError extends Error {
  constructor(statusCode: number) {
    super(`Netlify Blobs has generated an internal error: ${statusCode} response`)

    this.name = 'BlobsInternalError'
  }
}

export const collectIterator = async <T>(iterator: AsyncIterable<T>): Promise<T[]> => {
  const result: T[] = []

  for await (const item of iterator) {
    result.push(item)
  }

  return result
}

export const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error

export type Logger = (...message: unknown[]) => void

export const base64Decode = (input: string) => {
  // eslint-disable-next-line n/prefer-global/buffer
  const { Buffer } = globalThis

  if (Buffer) {
    return Buffer.from(input, 'base64').toString()
  }

  return atob(input)
}

export const base64Encode = (input: string) => {
  // eslint-disable-next-line n/prefer-global/buffer
  const { Buffer } = globalThis

  if (Buffer) {
    return Buffer.from(input).toString('base64')
  }

  return btoa(input)
}
