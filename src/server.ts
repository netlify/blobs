import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { isNodeError, Logger } from './util.ts'

interface BlobsServerOptions {
  /**
   * Whether debug-level information should be logged, such as internal errors
   * or information about incoming requests.
   */
  debug?: boolean

  /**
   * Base directory to read and write files from.
   */
  directory: string

  /**
   * Function to log messages. Defaults to `console.log`.
   */
  logger?: Logger

  /**
   * Port to run the server on. Defaults to a random port.
   */
  port?: number

  /**
   * Static authentication token that should be present in all requests. If not
   * supplied, no authentication check is performed.
   */
  token?: string
}

export class BlobsServer {
  private debug: boolean
  private directory: string
  private logger: Logger
  private port: number
  private server?: http.Server
  private token?: string

  constructor({ debug, directory, logger, port, token }: BlobsServerOptions) {
    this.debug = debug === true
    this.directory = directory
    this.logger = logger ?? console.log
    this.port = port || 0
    this.token = token
  }

  logDebug(...message: unknown[]) {
    if (!this.debug) {
      return
    }

    this.logger('[Netlify Blobs server]', ...message)
  }

  async delete(req: http.IncomingMessage, res: http.ServerResponse) {
    const { dataPath } = this.getFilePathFromURL(req.url)

    if (!dataPath) {
      return this.sendResponse(req, res, 400)
    }

    try {
      await fs.rm(dataPath, { recursive: true })
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return this.sendResponse(req, res, 404)
      }

      return this.sendResponse(req, res, 500)
    }

    return this.sendResponse(req, res, 200)
  }

  get(req: http.IncomingMessage, res: http.ServerResponse) {
    const { dataPath } = this.getFilePathFromURL(req.url)

    if (!dataPath) {
      return this.sendResponse(req, res, 400)
    }

    const stream = createReadStream(dataPath)

    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return this.sendResponse(req, res, 404)
      }

      return this.sendResponse(req, res, 500)
    })
    stream.on('finish', () => this.sendResponse(req, res, 200))
    stream.pipe(res)
  }

  async put(req: http.IncomingMessage, res: http.ServerResponse) {
    const { dataPath } = this.getFilePathFromURL(req.url)

    if (!dataPath) {
      return this.sendResponse(req, res, 400)
    }

    try {
      // We can't have multiple requests writing to the same file, which could
      // lead to corrupted data. Ideally we'd have a mechanism where the last
      // request wins, but that requires a more advanced state manager. For
      // now, we address this by writing data to a temporary file and then
      // moving it to the right path after the write has succeeded.
      const tempDirectory = await fs.mkdtemp(join(tmpdir(), 'netlify-blobs'))
      const tempPath = join(tempDirectory, basename(dataPath))

      await new Promise((resolve, reject) => {
        req.pipe(createWriteStream(tempPath))
        req.on('end', resolve)
        req.on('error', reject)
      })

      await fs.mkdir(dirname(dataPath), { recursive: true })
      await fs.rename(tempPath, dataPath)
      await fs.rm(tempDirectory, { force: true, recursive: true })
    } catch (error) {
      this.logDebug('Error when writing data:', error)

      return this.sendResponse(req, res, 500)
    }

    return this.sendResponse(req, res, 200)
  }

  /**
   * Returns the path to the local file associated with a given combination of
   * site ID, store name, and object, which are extracted from a URL path.
   */
  getFilePathFromURL(urlPath?: string) {
    if (!urlPath) {
      return {}
    }

    const [, siteID, storeName, key] = urlPath.split('/')

    if (!siteID || !storeName || !key) {
      return {}
    }

    const dataPath = resolve(this.directory, 'entries', siteID, storeName, key)

    return { dataPath }
  }

  handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.validateAccess(req)) {
      return this.sendResponse(req, res, 403)
    }

    switch (req.method) {
      case 'DELETE':
        return this.delete(req, res)

      case 'GET':
        return this.get(req, res)

      case 'PUT':
        return this.put(req, res)

      default:
        return this.sendResponse(req, res, 405)
    }
  }

  sendResponse(req: http.IncomingMessage, res: http.ServerResponse, status: number) {
    this.logDebug(`${req.method} ${req.url}: ${status}`)

    res.writeHead(status)
    res.end()
  }

  async start(): Promise<{ address: string; family: string; port: number }> {
    await fs.mkdir(this.directory, { recursive: true })

    const server = http.createServer((req, res) => this.handleRequest(req, res))

    this.server = server

    return new Promise((resolve, reject) => {
      server.listen(this.port, () => {
        const address = server.address()

        if (!address || typeof address === 'string') {
          return reject(new Error('Server cannot be started on a pipe or Unix socket'))
        }

        resolve(address)
      })
    })
  }

  async stop() {
    if (!this.server) {
      return
    }

    await new Promise((resolve, reject) => {
      this.server?.close((error?: NodeJS.ErrnoException) => {
        if (error) {
          return reject(error)
        }

        resolve(null)
      })
    })
  }

  validateAccess(req: http.IncomingMessage) {
    if (!this.token) {
      return true
    }

    const { authorization = '' } = req.headers
    const parts = authorization.split(' ')

    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return false
    }

    return parts[1] === this.token
  }
}
