#!/usr/bin/env node
const net = require('net')
const socketPath = process.env.STASISBOT_SOCKET || '/tmp/stasisbot.sock'
const message = process.argv.slice(2).join(' ').trim()
if (!message) {
  console.error('Usage: stasis-chat "message"')
  process.exit(2)
}
const socket = net.createConnection(socketPath)
socket.setEncoding('utf8')
socket.on('connect', () => socket.end(JSON.stringify({ type: 'chat', message })))
socket.on('data', data => process.stdout.write(data))
socket.on('error', err => {
  console.error(`Could not contact StasisBot: ${err.message}`)
  process.exit(1)
})
