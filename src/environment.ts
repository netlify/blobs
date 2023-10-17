import { Buffer } from 'node:buffer'
import { env } from 'node:process'

/**
 * The name of the environment variable that holds the context in a Base64,
 * JSON-encoded object. If we ever need to change the encoding or the shape
 * of this object, we should bump the version and create a new variable, so
 * that the client knows how to consume the data and can advise the user to
 * update the client if needed.
 */
const NETLIFY_CONTEXT_VARIABLE = 'NETLIFY_BLOBS_CONTEXT'

/**
 * The context object that we expect in the environment.
 */
export interface EnvironmentContext {
  apiURL?: string
  deployID?: string
  edgeURL?: string
  siteID?: string
  token?: string
}

export const getEnvironmentContext = (): EnvironmentContext => {
  if (!env[NETLIFY_CONTEXT_VARIABLE]) {
    return {}
  }

  const data = Buffer.from(env[NETLIFY_CONTEXT_VARIABLE], 'base64').toString()

  try {
    return JSON.parse(data) as EnvironmentContext
  } catch {
    // no-op
  }

  return {}
}

export class MissingBlobsEnvironmentError extends Error {
  constructor(requiredProperties: string[]) {
    super(
      `The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: ${requiredProperties.join(
        ', ',
      )}`,
    )

    this.name = 'MissingBlobsEnvironmentError'
  }
}
