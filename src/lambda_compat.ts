import { Buffer } from 'node:buffer'

import { EnvironmentContext, setEnvironmentContext } from './environment.ts'
import type { LambdaEvent } from './types.ts'

interface BlobsEventData {
  token: string
  url: string
}

export const connectLambda = (event: LambdaEvent) => {
  const rawData = Buffer.from(event.blobs, 'base64')
  const data = JSON.parse(rawData.toString('ascii')) as BlobsEventData
  const environmentContext: EnvironmentContext = {
    deployID: event.headers['x-nf-deploy-id'],
    edgeURL: data.url,
    siteID: event.headers['x-nf-site-id'],
    token: data.token,
  }

  setEnvironmentContext(environmentContext)
}
