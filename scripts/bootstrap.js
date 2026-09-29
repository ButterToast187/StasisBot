const fs = require('fs')
const path = require('path')
const { spawnSync, spawn } = require('child_process')

const root = path.resolve(__dirname, '..')
const RECONNECT_DELAY_MS = 60_000

function canResolve(name) {
  try {
    require.resolve(name, { paths: [root] })
    return true
  } catch {
    return false
  }
}

function runNpmInstall() {
  console.log('[SETUP] Fehlende Node-Abhängigkeiten erkannt.')
  console.log('[SETUP] Repariere Installation automatisch ...')

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npmCmd, ['install'], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  })

  if (result.error || result.status !== 0) {
    console.error('[SETUP] npm install ist fehlgeschlagen.')
    if (result.error) console.error(result.error)
    process.exit(result.status || 1)
  }
}

function patchMinecraft262UseItemOnPacket() {
  const protocolFile = path.join(
    root,
    'node_modules',
    'minecraft-data',
    'minecraft-data',
    'data',
    'pc',
    '26.2',
    'protocol.json'
  )

  if (!fs.existsSync(protocolFile)) {
    console.warn('[SETUP] Minecraft-26.2 protocol.json nicht gefunden; Packet-Patch übersprungen.')
    return
  }

  let source = fs.readFileSync(protocolFile, 'utf8')

  // Complexity-ML minecraft-data 26.2.5 maps these four serverbound packets
  // one ID too low. A normal Mineflayer block interaction (block_place /
  // USE_ITEM_ON) is therefore sent as 0x41 and decoded by a vanilla 26.2
  // server as TEST_INSTANCE_BLOCK_ACTION. The correct IDs are 0x41..0x44,
  // with USE_ITEM_ON/block_place at 0x42.
  const wrongMapping = [
    '"0x40": "test_instance_block_action"',
    '"0x41": "block_place"',
    '"0x42": "use_item"',
    '"0x43": "custom_click_action"'
  ]

  const fixedMapping = [
    '"0x41": "test_instance_block_action"',
    '"0x42": "block_place"',
    '"0x43": "use_item"',
    '"0x44": "custom_click_action"'
  ]

  if (fixedMapping.every(entry => source.includes(entry))) {
    return
  }

  if (!wrongMapping.every(entry => source.includes(entry))) {
    console.warn('[SETUP] 26.2 Packet-Mapping hat ein unbekanntes Format; Patch nicht angewendet.')
    return
  }

  // Replace from high to low so newly-created IDs are not touched again.
  source = source
    .replace('"0x43": "custom_click_action"', '"0x44": "custom_click_action"')
    .replace('"0x42": "use_item"', '"0x43": "use_item"')
    .replace('"0x41": "block_place"', '"0x42": "block_place"')
    .replace('"0x40": "test_instance_block_action"', '"0x41": "test_instance_block_action"')

  fs.writeFileSync(protocolFile, source, 'utf8')
  console.log('[SETUP] Minecraft-26.2 USE_ITEM_ON Packet-Patch angewendet (block_place: 0x42).')
}

function patchMineflayerTeam() {
  const teamFile = path.join(root, 'node_modules', 'mineflayer', 'lib', 'team.js')
  if (!fs.existsSync(teamFile)) return

  let source = fs.readFileSync(teamFile, 'utf8')
  if (source.includes('STASISBOT_26_2_TEAM_PATCH')) return

  const needle = '  parseMessage (value) {\n'
  const replacement = `  parseMessage (value) {\n    // STASISBOT_26_2_TEAM_PATCH\n    // Some 26.2 servers can send an empty team prefix/suffix.\n    if (value === undefined || value === null) {\n      return new ChatMessage('')\n    }\n`

  if (!source.includes(needle)) {
    console.warn('[SETUP] Mineflayer team.js wurde gefunden, Patch-Stelle aber nicht erkannt.')
    return
  }

  source = source.replace(needle, replacement)
  fs.writeFileSync(teamFile, source, 'utf8')
  console.log('[SETUP] Mineflayer-26.2-Team-Patch angewendet.')
}

function ensureDependencies() {
  const required = ['dotenv', 'mineflayer', 'mineflayer-pathfinder', 'minecraft-protocol']
  let missing = required.filter(name => !canResolve(name))

  if (missing.length > 0) {
    console.log(`[SETUP] Fehlt: ${missing.join(', ')}`)
    runNpmInstall()
    missing = required.filter(name => !canResolve(name))
    if (missing.length > 0) {
      console.error(`[SETUP] Nach npm install fehlen weiterhin: ${missing.join(', ')}`)
      process.exit(1)
    }
  }

  patchMinecraft262UseItemOnPacket()
  patchMineflayerTeam()
}

ensureDependencies()

let child = null
let stopping = false
let restartTimer = null

function formatSeconds(ms) {
  return Math.round(ms / 1000)
}

function startBotProcess() {
  if (stopping) return

  console.log('')
  console.log('=================================')
  console.log('      StasisBot Supervisor')
  console.log('=================================')
  console.log('[SUPERVISOR] Starte Bot-Prozess ...')

  child = spawn(process.execPath, [path.join(root, 'src', 'index.js')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })

  child.on('error', error => {
    console.error('[SUPERVISOR] Bot-Prozess konnte nicht gestartet werden:', error)
  })

  child.on('exit', (code, signal) => {
    child = null

    if (stopping) {
      console.log('[SUPERVISOR] Bot wurde manuell beendet. Kein Reconnect.')
      return
    }

    console.log('')
    console.log(`[SUPERVISOR] Bot-Prozess beendet (code=${code}, signal=${signal || 'none'}).`)
    console.log(`[SUPERVISOR] Neuer Verbindungsversuch in ${formatSeconds(RECONNECT_DELAY_MS)} Sekunden ...`)

    restartTimer = setTimeout(() => {
      restartTimer = null
      startBotProcess()
    }, RECONNECT_DELAY_MS)
  })
}

function shutdown(signal) {
  if (stopping) return
  stopping = true

  console.log('')
  console.log(`[SUPERVISOR] ${signal} empfangen. Beende StasisBot ...`)

  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }

  if (child && !child.killed) {
    child.kill(signal)
  }

  // Keep a short fallback so Windows/Linux do not leave the supervisor hanging.
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

console.log('[SETUP] Dependencies OK.')
console.log(`[SUPERVISOR] Auto-Reconnect aktiv: ${formatSeconds(RECONNECT_DELAY_MS)} Sekunden.`)
startBotProcess()
