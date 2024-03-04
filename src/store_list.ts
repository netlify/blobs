import { ListStoresResponse } from './backend/list_stores.ts'
import { Client, ClientOptions, getClientOptions } from './client.ts'
import { getEnvironmentContext } from './environment.ts'
import { DEPLOY_STORE_PREFIX, SITE_STORE_PREFIX } from './store.ts'
import { HTTPMethod } from './types.ts'
import { collectIterator } from './util.ts'

export function listStores(options: Partial<ClientOptions> & { paginate: true }): AsyncIterable<ListStoresResponse>
export function listStores(options?: Partial<ClientOptions> & { paginate?: false }): Promise<ListStoresResponse>
export function listStores(
  options: Partial<ClientOptions> & { paginate?: boolean } = {},
): AsyncIterable<ListStoresResponse> | Promise<ListStoresResponse> {
  const context = getEnvironmentContext()
  const clientOptions = getClientOptions(options, context)
  const client = new Client(clientOptions)
  const iterator = getListIterator(client, SITE_STORE_PREFIX)

  if (options.paginate) {
    return iterator
  }

  // We can't use `async/await` here because that would make the signature
  // incompatible with one of the overloads.
  // eslint-disable-next-line promise/prefer-await-to-then
  return collectIterator(iterator).then((results) =>
    results.reduce(
      (acc, item) => ({
        ...acc,
        stores: [...acc.stores, ...item.stores],
      }),
      { stores: [] },
    ),
  )
}

const formatListStoreResponse = (rawStores: string[]) =>
  rawStores.reduce((acc, rawStore) => {
    if (rawStore.startsWith(DEPLOY_STORE_PREFIX)) {
      return acc
    }

    if (rawStore.startsWith(SITE_STORE_PREFIX)) {
      return [...acc, rawStore.slice(SITE_STORE_PREFIX.length)]
    }

    return [...acc, rawStore]
  }, [] as string[])

const getListIterator = (client: Client, prefix: string): AsyncIterable<ListStoresResponse> => {
  const parameters: Record<string, string> = {
    prefix,
  }

  return {
    [Symbol.asyncIterator]() {
      let currentCursor: string | null = null
      let done = false

      return {
        async next() {
          if (done) {
            return { done: true, value: undefined }
          }

          const nextParameters = { ...parameters }

          if (currentCursor !== null) {
            nextParameters.cursor = currentCursor
          }

          const res = await client.makeRequest({
            method: HTTPMethod.GET,
            parameters: nextParameters,
          })
          const page = (await res.json()) as ListStoresResponse

          if (page.next_cursor) {
            currentCursor = page.next_cursor
          } else {
            done = true
          }

          return {
            done: false,
            value: {
              ...page,
              stores: formatListStoreResponse(page.stores),
            },
          }
        },
      }
    },
  }
}
