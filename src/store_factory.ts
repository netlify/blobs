import { Client, ClientOptions, getClientOptions } from './client.ts'
import { getEnvironmentContext, MissingBlobsEnvironmentError } from './environment.ts'
import { Store } from './store.ts'

/**
 * Gets a reference to a deploy-scoped store.
 */
export const getDeployStore = (options: Partial<ClientOptions> = {}): Store => {
  const context = getEnvironmentContext()
  const { deployID } = context

  if (!deployID) {
    throw new MissingBlobsEnvironmentError(['deployID'])
  }

  const clientOptions = getClientOptions(options, context)
  const client = new Client(clientOptions)

  return new Store({ client, deployID })
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

  if (typeof input.name === 'string') {
    const { name } = input
    const clientOptions = getClientOptions(input)

    if (!name) {
      throw new MissingBlobsEnvironmentError(['name'])
    }

    const client = new Client(clientOptions)

    return new Store({ client, name })
  }

  if (typeof input.deployID === 'string') {
    const clientOptions = getClientOptions(input)
    const { deployID } = input

    if (!deployID) {
      throw new MissingBlobsEnvironmentError(['deployID'])
    }

    const client = new Client(clientOptions)

    return new Store({ client, deployID })
  }

  throw new Error('`getStore()` requires a `name` or `siteID` properties.')
}
