export class BlobsInternalError extends Error {
  constructor(statusCode: number) {
    super(`Netlify Blobs has generated an internal error: ${statusCode} response`)

    this.name = 'BlobsInternalError'
  }
}

export const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error

export type Logger = (...message: unknown[]) => void
