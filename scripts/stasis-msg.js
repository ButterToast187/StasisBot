#!/usr/bin/env node
const net = require('net')
const socketPath = process.env.STASISBOT_SOCKET || '/tmp/stasisbot.sock'
const player = (process.argv[2] || '').trim()
const message = process.argv.slice(3).join(' ').trim()
if (!player || !message) {
  console.error('Usage: stasis-msg PLAYER "message"')
  process.exit(2)
}
const socket = net.createConnection(socketPath)
socket.setEncoding('utf8')
socket.on('connect', () => socket.end(JSON.stringify({ type: 'msg', player, message })))
socket.on('data', data => process.stdout.write(data))
socket.on('error', err => {
  console.error(`Could not contact StasisBot: ${err.message}`)
  process.exit(1)
})
