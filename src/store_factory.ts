import { Client, ClientOptions, getClientOptions } from './client.ts'
import { getEnvironmentContext, MissingBlobsEnvironmentError } from './environment.ts'
import { Store } from './store.ts'

type ExperimentalRegion =
  // Sets "region=auto", which is supported by our API in deploy stores.
  | 'auto'

  // Loads the region from the environment context and throws if not found.
  | 'context'

interface GetDeployStoreOptions extends Partial<ClientOptions> {
  deployID?: string
  name?: string
  experimentalRegion?: ExperimentalRegion
}

/**
 * Gets a reference to a deploy-scoped store.
 */
export const getDeployStore = (input: GetDeployStoreOptions | string = {}): Store => {
  const context = getEnvironmentContext()
  const options = typeof input === 'string' ? { name: input } : input
  const deployID = options.deployID ?? context.deployID

  if (!deployID) {
    throw new MissingBlobsEnvironmentError(['deployID'])
  }

  const clientOptions = getClientOptions(options, context)

  if (options.experimentalRegion === 'context') {
    if (!context.primaryRegion) {
      throw new Error(
        'The Netlify Blobs client was initialized with `experimentalRegion: "context"` but there is no region configured in the environment',
      )
    }

    clientOptions.region = context.primaryRegion
  } else if (options.experimentalRegion === 'auto') {
    if (clientOptions.edgeURL) {
      throw new Error(
        'The Netlify Blobs client was initialized with `experimentalRegion: "auto"` which is not compatible with the `edgeURL` property; consider using `apiURL` instead',
      )
    }

    clientOptions.region = options.experimentalRegion
  }

  const client = new Client(clientOptions)

  return new Store({ client, deployID, name: options.name })
}

interface GetStoreOptions extends Partial<ClientOptions> {
  deployID?: string
  name?: string
}

/**
 * Gets a reference to a store.
 *
 * @param input Either a string containing the store name or an options object
 */
export const getStore: {
  (name: string): Store
  (options: GetStoreOptions): Store
} = (input) => {
  if (typeof input === 'string') {
    const clientOptions = getClientOptions({})
    const client = new Client(clientOptions)

    return new Store({ client, name: input })
  }

  if (typeof input?.name === 'string') {
    const { name } = input
    const clientOptions = getClientOptions(input)

    if (!name) {
      throw new MissingBlobsEnvironmentError(['name'])
    }

    const client = new Client(clientOptions)

    return new Store({ client, name })
  }

  if (typeof input?.deployID === 'string') {
    const clientOptions = getClientOptions(input)
    const { deployID } = input

    if (!deployID) {
      throw new MissingBlobsEnvironmentError(['deployID'])
    }

    const client = new Client(clientOptions)

    return new Store({ client, deployID })
  }

  throw new Error(
    'The `getStore` method requires the name of the store as a string or as the `name` property of an options object',
  )
}
