import { Buffer } from 'node:buffer'
import { env } from 'node:process'

declare global {
  // Using `var` so that the declaration is hoisted in such a way that we can
  // reference it before it's initialized.
  // eslint-disable-next-line no-var
  var netlifyBlobsContext: unknown
}

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
  const context = globalThis.netlifyBlobsContext || env.NETLIFY_BLOBS_CONTEXT

  if (typeof context !== 'string' || !context) {
    return {}
  }

  const data = Buffer.from(context, 'base64').toString()

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
