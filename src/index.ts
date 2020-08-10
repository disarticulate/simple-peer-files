import * as Peer from 'simple-peer'
import PeerFileSend from './PeerFileSend'
import PeerFileReceive from './PeerFileReceive'

export default class PeerFile {
  private arrivals: {
    [fileID: string]: PeerFileReceive
  } = {}

  send (peer: Peer, fileID: string, file: File) {
    return new Promise(resolve => {
      const controlChannel = peer

      let startingChunk = 0

      const fileChannel = new Peer({
        initiator: true
      })

      fileChannel.on('signal', (signal: Peer.SignalData) => {
        controlChannel.send(JSON.stringify({
          fileID,
          fileName: file.name,
          fileSize: file.size,
          signal
        }))
      })

      let controlDataHandler = (data: string) => {
        try {
          const dataJSON = JSON.parse(data)

          if (dataJSON.signal && dataJSON.fileID && dataJSON.fileID === fileID) {
            if (dataJSON.start) {
              startingChunk = dataJSON.start
            }

            fileChannel.signal(dataJSON.signal)
          }
        } catch (e) {}
      }

      fileChannel.on('connect', () => {
        const pfs = new PeerFileSend(fileChannel, file, startingChunk)

        pfs.on('done', () => {
          controlChannel.off('data', controlDataHandler)
          fileChannel.destroy()
          controlDataHandler = null // garbage collect
        })

        resolve(pfs)
      })

      controlChannel.on('data', controlDataHandler)
    })
  }

  receive (peer: Peer, fileID: string) {
    return new Promise(resolve => {
      const controlChannel = peer

      let fileName: string
      let fileSize: number

      const fileChannel = new Peer({
        initiator: false,
        trickle: false
      })

      fileChannel.on('signal', (signal: Peer.SignalData) => {
        // chunk to start sending from
        let start = 0

        // File resume capability
        if (fileID in this.arrivals) {
          start = this.arrivals[fileID].chunksReceived + 1
        }

        controlChannel.send(JSON.stringify({
          fileID,
          start,
          signal
        }))
      })

      let controlDataHandler = (data: string) => {
        try {
          const dataJSON = JSON.parse(data)

          if (dataJSON.signal && dataJSON.fileID && dataJSON.fileID === fileID) {
            fileName = dataJSON.fileName
            fileSize = dataJSON.fileSize
            fileChannel.signal(dataJSON.signal)
          }
        } catch (e) {}
      }

      fileChannel.on('connect', () => {
        let pfs: PeerFileReceive

        if (fileID in this.arrivals) {
          pfs = this.arrivals[fileID]
          pfs.setPeer(fileChannel)
        } else {
          pfs = new PeerFileReceive(fileChannel)
          this.arrivals[fileID] = pfs
        }

        pfs.on('done', () => {
          controlChannel.off('data', controlDataHandler)
          fileChannel.destroy()
          delete this.arrivals[fileID]
          controlDataHandler = null // garbage collect
        })

        resolve(pfs)
      })

      controlChannel.on('data', controlDataHandler)
    })
  }
}

export { PeerFileSend, PeerFileReceive }
