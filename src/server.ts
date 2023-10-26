import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { ListResponse } from './backend/list.ts'
import { decodeMetadata, encodeMetadata, METADATA_HEADER_EXTERNAL, METADATA_HEADER_INTERNAL } from './metadata.ts'
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
  private address: string
  private debug: boolean
  private directory: string
  private logger: Logger
  private port: number
  private server?: http.Server
  private token?: string

  constructor({ debug, directory, logger, port, token }: BlobsServerOptions) {
    this.address = ''
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
    const url = new URL(req.url ?? '', this.address)
    const { dataPath, key } = this.getLocalPaths(url)

    if (!dataPath || !key) {
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

  async get(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '', this.address)
    const { dataPath, key, metadataPath, rootPath } = this.getLocalPaths(url)

    if (!dataPath || !metadataPath) {
      return this.sendResponse(req, res, 400)
    }

    // If there is no key in the URL, it means a `list` operation.
    if (!key) {
      return this.list({ dataPath, metadataPath, rootPath, req, res, url })
    }

    const headers: Record<string, string> = {}

    try {
      const rawData = await fs.readFile(metadataPath, 'utf8')
      const metadata = JSON.parse(rawData)
      const encodedMetadata = encodeMetadata(metadata)

      if (encodedMetadata) {
        headers[METADATA_HEADER_INTERNAL] = encodedMetadata
      }
    } catch (error) {
      this.logDebug('Could not read metadata file:', error)
    }

    for (const name in headers) {
      res.setHeader(name, headers[name])
    }

    const stream = createReadStream(dataPath)

    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EISDIR' || error.code === 'ENOENT') {
        return this.sendResponse(req, res, 404)
      }

      return this.sendResponse(req, res, 500)
    })
    stream.pipe(res)
  }

  async list(options: {
    dataPath: string
    metadataPath: string
    rootPath: string
    req: http.IncomingMessage
    res: http.ServerResponse
    url: URL
  }) {
    const { dataPath, rootPath, req, res, url } = options
    const directories = url.searchParams.get('directories') === 'true'
    const prefix = url.searchParams.get('prefix') ?? ''
    const result: ListResponse = {
      blobs: [],
      directories: [],
    }

    try {
      await BlobsServer.walk({ directories, path: dataPath, prefix, rootPath, result })
    } catch (error) {
      this.logDebug('Could not perform list:', error)

      return this.sendResponse(req, res, 500)
    }

    res.setHeader('content-type', 'application/json')

    return this.sendResponse(req, res, 200, JSON.stringify(result))
  }

  async put(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '', this.address)
    const { dataPath, key, metadataPath } = this.getLocalPaths(url)

    if (!dataPath || !key || !metadataPath) {
      return this.sendResponse(req, res, 400)
    }

    const metadataHeader = req.headers[METADATA_HEADER_EXTERNAL]
    const metadata = decodeMetadata(Array.isArray(metadataHeader) ? metadataHeader[0] : metadataHeader ?? null)

    try {
      // We can't have multiple requests writing to the same file, which could
      // lead to corrupted data. Ideally we'd have a mechanism where the last
      // request wins, but that requires a more advanced state manager. For
      // now, we address this by writing data to a temporary file and then
      // moving it to the right path after the write has succeeded.
      const tempDirectory = await fs.mkdtemp(join(tmpdir(), 'netlify-blobs'))
      const relativeDataPath = relative(this.directory, dataPath)
      const tempDataPath = join(tempDirectory, relativeDataPath)

      await fs.mkdir(dirname(tempDataPath), { recursive: true })

      await new Promise((resolve, reject) => {
        req.pipe(createWriteStream(tempDataPath))
        req.on('end', resolve)
        req.on('error', reject)
      })

      await fs.mkdir(dirname(dataPath), { recursive: true })
      await fs.rename(tempDataPath, dataPath)
      await fs.rm(tempDirectory, { force: true, recursive: true })

      await fs.mkdir(dirname(metadataPath), { recursive: true })
      await fs.writeFile(metadataPath, JSON.stringify(metadata))
    } catch (error) {
      this.logDebug('Error when writing data:', error)

      return this.sendResponse(req, res, 500)
    }

    return this.sendResponse(req, res, 200)
  }

  /**
   * Parses the URL and returns the filesystem paths where entries and metadata
   * should be stored.
   */
  getLocalPaths(url?: URL) {
    if (!url) {
      return {}
    }

    const [, siteID, storeName, ...key] = url.pathname.split('/')

    if (!siteID || !storeName) {
      return {}
    }

    const rootPath = resolve(this.directory, 'entries', siteID, storeName)
    const dataPath = resolve(rootPath, ...key)
    const metadataPath = resolve(this.directory, 'metadata', siteID, storeName, ...key)

    return { dataPath, key: key.join('/'), metadataPath, rootPath }
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

  sendResponse(req: http.IncomingMessage, res: http.ServerResponse, status: number, body?: string) {
    this.logDebug(`${req.method} ${req.url}: ${status}`)

    res.writeHead(status)
    res.end(body)
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

        this.address = `http://localhost:${address.port}`

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

  /**
   * Traverses a path and collects both blobs and directories into a `result`
   * object, taking into account the `directories` and `prefix` parameters.
   */
  private static async walk(options: {
    directories: boolean
    path: string
    prefix: string
    result: ListResponse
    rootPath: string
  }) {
    const { directories, path, prefix, result, rootPath } = options
    const entries = await fs.readdir(path)

    for (const entry of entries) {
      const entryPath = join(path, entry)
      const stat = await fs.stat(entryPath)

      let key = relative(rootPath, entryPath)

      // Normalize keys to use `/` as delimiter regardless of OS.
      if (sep !== '/') {
        key = key.split(sep).join('/')
      }

      // To match the key against the prefix, we start by creating a "mask",
      // which consists of the subset of the key up to the length of the
      // prefix.
      const mask = key.slice(0, prefix.length)

      // There is a match if the mask matches the prefix.
      const isMatch = prefix.startsWith(mask)

      if (!isMatch) {
        continue
      }

      // If the entry is a file, add it to the `blobs` bucket.
      if (!stat.isDirectory()) {
        // We don't support conditional requests in the local server, so we
        // generate a random ETag for each entry.
        const etag = Math.random().toString().slice(2)

        result.blobs?.push({
          etag,
          key,
          last_modified: stat.mtime.toISOString(),
          size: stat.size,
        })

        continue
      }

      // The entry is a directory. We push it to the `directories` bucket only
      // if the `directories` parameter is enabled and we're at the same level
      // as the prefix. For example, if the prefix is `animals/cats/` and the
      // key we're processing is `animals`, we don't want to push it to the
      // `directories` bucket. We want to traverse it.
      if (directories && key.startsWith(prefix)) {
        result.directories?.push(key)

        continue
      }

      // Call this method recursively with the directory as the starting point.
      await BlobsServer.walk({ directories, path: entryPath, prefix, rootPath, result })
    }
  }
}
