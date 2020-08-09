import { EventEmitter } from 'ee-ts'
import SimplePeer from 'simple-peer'
import { through } from 'through'

import ControlHeaders from './ControlHeaders'
import FileSendRequest from './FileSendRequest'
import FileStartMetadata from './FileStartMetadata'

import * as read from 'filereader-stream'

interface Events {
  progress(bytesSent: number): void,
  done(): void
  // Called when the sender (this) has requested a cancel
  cancel(): void

  // Called when the receiver has requested a cancel
  cancelled(): void
}

export default class PeerFileSend extends EventEmitter<Events> {
  private peer: SimplePeer.Instance;
  private file: File;
  private chunkSize = Math.pow(2, 13);
  private totalChunks: number;
  private startingChunk: number;
  private req: FileSendRequest;
  private cancelled: boolean = false;

  constructor (peer: SimplePeer.Instance, file: File, startingChunk: number = 0) {
    super()

    this.peer = peer
    this.file = file
    this.totalChunks = Math.ceil(this.file.size / this.chunkSize)

    this.startingChunk = startingChunk
  }

  // Structure of File Start Data
  // 1st byte -> Type of data sent (will be set to ControlHeaders.FILE_START)
  // Rest of the data will be assigned to the uint8array merge of JSON string the file metadata
  // TODO : Much more compressed binary representation plz
  private prepareFileStartData (): Uint8Array {
    const meta: FileStartMetadata = {
      totalChunks: this.totalChunks,
      fileType: this.file.type,
      chunkSize: this.chunkSize
    }

    const metaString = JSON.stringify(meta)

    const metaByteArray = new TextEncoder().encode(metaString)

    // + 1 for storing the header byte
    const resp = new Uint8Array(metaByteArray.length + 1)

    // Header byte
    resp[0] = ControlHeaders.FILE_START
    resp.set(metaByteArray, 1)

    return resp
  }

  // Structure for chunk data
  // 1st byte -> Data type header (ControlHeaders.FILE_CHUNK)
  // Rest of the bytes will be the chunk data with length the length specified in the chunk size
  private prepareChunkData (chunk: Uint8Array): Uint8Array {
    // + 1 for the header
    const resp = new Uint8Array(chunk.length + 1)

    resp[0] = ControlHeaders.FILE_CHUNK
    resp.set(chunk, 1)

    return resp
  }

  // Structure for end data
  // 1st byte -> Data type header (ControlHeaders.FILE_END)
  private prepareFileEndData (): Uint8Array {
    const resp = new Uint8Array(1)

    resp[0] = ControlHeaders.FILE_END

    return resp
  }

  // Structure for delete data
  // 1st byte -> Data type header (ControlHeaders.TRANSFER_CANCEL)
  private prepareCancelData (): Uint8Array {
    const resp = new Uint8Array(1)

    resp[0] = ControlHeaders.TRANSFER_CANCEL

    return resp
  }

  start () {
    // Listen for cancel requests
    this.peer.on('data', (data: Uint8Array) => {
      if (data[0] === ControlHeaders.TRANSFER_CANCEL) {
        this.cancelled = true
        this.peer.destroy()

        this.emit('cancelled')
      }
    })

    let offset = 0
    let chunksSent = 0

    if (this.startingChunk > 0) {
      // Resume
      // starting chunk number is the next chunk needd
      offset = (this.startingChunk - 1) * this.chunkSize

      // so number of chunks already sent will be -1
      chunksSent = this.startingChunk - 1
    } else {
      // Start
      const startHeader = this.prepareFileStartData()

      this.peer.send(startHeader)
      this.emit('progress', 0)
    }

    // Chunk sending
    const stream = read(this.file, {
      chunkSize: this.chunkSize,
      offset
    })

    stream.pipe(through(
      (chunk: any) => {
      // TODO : Some way to actually stop this function on cancel
        if (!this.cancelled) {
          this.peer.send(this.prepareChunkData(chunk))

          chunksSent++

          this.emit('progress', Math.min(this.file.size, chunksSent * this.chunkSize))
        }
      },
      () => {
        this.peer.send(this.prepareFileEndData())

        this.emit('progress', this.file.size)
        this.emit('done')

        // Destroy peer
        this.peer.destroy()
      }
    ))
  }

  cancel () {
    this.cancelled = true
    this.peer.send(this.prepareCancelData())
    this.emit('cancel')
  }
}