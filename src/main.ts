export { connectLambda } from './lambda_compat.ts'
export { getDeployStore, getStore } from './store_factory.ts'
export { listStores } from './store_list.ts'
export type {
  Store,
  StoreOptions,
  GetWithMetadataOptions,
  GetWithMetadataResult,
  ListOptions,
  ListResultBlob,
  SetOptions,
  BlobResponseType,
} from './store.ts'
