require('dotenv').config()

const mineflayer = require('mineflayer')
const fs = require('fs')
const path = require('path')
const net = require('net')

const {
  pathfinder,
  Movements
} = require('mineflayer-pathfinder')

const minecraftData =
  require('minecraft-data')

const {
  executeRoute
} = require('./stasis')

const {
  scanStasis
} = require('./scanner')

const {
  createStasis
} = require('./stasisCreator')

const {
  removeStasis
} = require('./stasisRemover')

const {
  pullStasis
} = require('./stasisInteraction')

const {
  checkRegistryConsistency
} = require('./consistencyChecker')

const {
  getPlayerStasis
} = require('./registry')

const {
  getChamberCount,
  isValidChamberId
} = require('./chambers')

const config = require('./config')

const {
  countInventoryFood,
  runFoodMaintenance
} = require('./foodManager')

const {
  countInventoryTotems,
  hasTotemInOffhand,
  runTotemMaintenance
} = require('./totemManager')

const {
  sleepInBed
} = require('./sleepManager')

const {
  snapshotArmor,
  recoverAfterDeath,
  armorDurability
} = require('./armorManager')

// =================================
// SERVER CONFIG
// =================================

const HOST =
  process.env.MC_HOST ||
  'vanilla.nimera.fun'

const PORT =
  Number(
    process.env.MC_PORT ||
    25565
  )

const USERNAME =
  process.env.BOT_USERNAME ||
  'Ziegengaming69'

// =================================
// ADMIN PERMISSIONS
// =================================

const ADMIN_FILE =
  path.join(
    __dirname,
    '..',
    'data',
    'admins.json'
  )

const BAN_FILE =
  path.join(
    __dirname,
    '..',
    'data',
    'bans.json'
  )

const ADMIN_ONLY_COMMANDS =
  new Set([
    'route',
    'scan',
    'checkregistry',
    'ban',
    'unban',
    'banlist'
  ])

function loadAdmins() {
  try {
    const raw =
      fs.readFileSync(
        ADMIN_FILE,
        'utf8'
      )

    const data =
      JSON.parse(raw)

    if (
      !data ||
      !Array.isArray(data.admins)
    ) {
      throw new Error(
        'admins.json must contain an \"admins\" array.'
      )
    }

    return new Set(
      data.admins
        .map(name =>
          String(name || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
  } catch (error) {
    console.error(
      '[ADMIN] Admin-Liste konnte nicht geladen werden:',
      error.message
    )

    // Fail closed: if the file is broken, nobody receives admin rights.
    return new Set()
  }
}

let admins =
  loadAdmins()

function isAdmin(player) {
  return admins.has(
    String(player || '')
      .trim()
      .toLowerCase()
  )
}

function normalizePlayerName(player) {
  return String(player || '')
    .trim()
    .toLowerCase()
}

function isValidPlayerName(player) {
  return /^[A-Za-z0-9_]{1,16}$/.test(
    String(player || '').trim()
  )
}

function loadBans() {
  try {
    if (!fs.existsSync(BAN_FILE)) {
      fs.writeFileSync(
        BAN_FILE,
        JSON.stringify({ bans: [] }, null, 2) + '\n',
        'utf8'
      )
    }

    const raw =
      fs.readFileSync(
        BAN_FILE,
        'utf8'
      )

    const data =
      JSON.parse(raw)

    if (
      !data ||
      !Array.isArray(data.bans)
    ) {
      throw new Error(
        'bans.json must contain a "bans" array.'
      )
    }

    return new Map(
      data.bans
        .map(name => String(name || '').trim())
        .filter(isValidPlayerName)
        .map(name => [
          normalizePlayerName(name),
          name
        ])
    )
  } catch (error) {
    console.error(
      '[BAN] Ban-Liste konnte nicht geladen werden:',
      error.message
    )

    // Fail open for bans: a broken ban file must not lock everyone out.
    return new Map()
  }
}

function saveBans() {
  const tmpFile =
    `${BAN_FILE}.tmp`

  const data = {
    bans: Array.from(bans.values())
      .sort((a, b) =>
        a.localeCompare(
          b,
          undefined,
          { sensitivity: 'base' }
        )
      )
  }

  fs.writeFileSync(
    tmpFile,
    JSON.stringify(data, null, 2) + '\n',
    'utf8'
  )

  fs.renameSync(
    tmpFile,
    BAN_FILE
  )
}

let bans =
  loadBans()

function isBanned(player) {
  return bans.has(
    normalizePlayerName(player)
  )
}

function getAvailableCommands(player) {
  const publicCommands = [
    'ping',
    'status',
    'sleep',
    'createstasis',
    'removestasis',
    'pull'
  ]

  if (isAdmin(player)) {
    publicCommands.splice(
      3,
      0,
      'route',
      'scan',
      'checkregistry',
      'pos',
      'ban <username>',
      'unban <username>',
      'banlist'
    )
  }

  return publicCommands.join(', ')
}

// =================================
// START INFO
// =================================

console.log('')
console.log('=================================')
console.log('        StasisBot - Phase 4')
console.log('=================================')

console.log(
  `Server: ${HOST}:${PORT}`
)

console.log(
  `Account: ${USERNAME}`
)

console.log(
  `Admins: ${
    admins.size > 0
      ? Array.from(admins).join(', ')
      : '(none)'
  }`
)

console.log(
  `Banned users: ${bans.size}`
)

console.log('')

// =================================
// BOT ERSTELLEN
// =================================

const bot =
  mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    auth: 'microsoft',
    version: '26.2'
  })

bot.loadPlugin(
  pathfinder
)

// =================================
// BUSY SYSTEM
// =================================

const busy = {
  active: false,
  task: null,
  sender: null
}

function setBusy(
  task,
  sender
) {
  busy.active = true
  busy.task = task
  busy.sender = sender

  console.log(
    `[BUSY] Aktiv: ${task} | ` +
    `gestartet von ${sender}`
  )
}

function clearBusy() {
  console.log(
    `[BUSY] Frei` +
    (
      busy.task
        ? ` | beendet: ${busy.task}`
        : ''
    )
  )

  busy.active = false
  busy.task = null
  busy.sender = null
}

function getBusyText() {
  if (!busy.active) {
    return 'frei'
  }

  return (
    busy.task ||
    'busy'
  )
}

// =================================
// AUTOMATIC FOOD MAINTENANCE
// =================================

let foodMaintenanceRunning = false
let lastFoodWarningAt = 0

function notifyAdminsFoodWarning(message) {
  const now = Date.now()
  const warningCooldownMs = 30 * 60 * 1000

  if (now - lastFoodWarningAt < warningCooldownMs) {
    return
  }

  lastFoodWarningAt = now

  for (const admin of admins) {
    sendMsg(
      admin,
      `Food warning: ${message}`
    )
  }
}

function needsFoodMaintenance() {
  if (!bot.entity) {
    return false
  }

  const foodConfig = config.food || {}
  const eatAtOrBelow = Number(foodConfig.eatAtOrBelow ?? 14)
  const refillBelow = Number(foodConfig.refillBelow ?? 16)
  const inventoryFood = countInventoryFood(bot)

  return (
    (typeof bot.food === 'number' && bot.food <= eatAtOrBelow) ||
    inventoryFood < refillBelow
  )
}

async function maybeRunFoodMaintenance() {
  if (
    foodMaintenanceRunning ||
    busy.active ||
    !needsFoodMaintenance()
  ) {
    return
  }

  foodMaintenanceRunning = true
  setBusy(
    'food maintenance',
    'system'
  )

  try {
    const result = await runFoodMaintenance(bot)

    if (
      result &&
      result.reason === 'chest_empty'
    ) {
      notifyAdminsFoodWarning(
        'The food chest is empty or contains no supported food. Please refill it.'
      )
    }
  } catch (error) {
    console.error(
      '[FOOD ERROR]',
      error
    )

    try {
      bot.pathfinder.setGoal(null)
    } catch {
    }

    notifyAdminsFoodWarning(
      `Automatic food refill failed: ${error.message}`
    )
  } finally {
    clearBusy()
    foodMaintenanceRunning = false
  }
}

// =================================
// AUTOMATIC TOTEM MAINTENANCE
// =================================

let totemMaintenanceRunning = false
let lastTotemWarningAt = 0

function notifyAdminsTotemWarning(message) {
  const now = Date.now()
  const warningCooldownMs = 30 * 60 * 1000
  if (now - lastTotemWarningAt < warningCooldownMs) return
  lastTotemWarningAt = now
  for (const admin of admins) {
    sendMsg(admin, `Totem warning: ${message}`)
  }
}

function needsTotemMaintenance() {
  if (!bot.entity) return false
  const refillBelow = Number(config.totem?.refillBelow ?? 2)
  return !hasTotemInOffhand(bot) || countInventoryTotems(bot) < refillBelow
}

async function maybeRunTotemMaintenance() {
  if (totemMaintenanceRunning || busy.active || !needsTotemMaintenance()) return

  totemMaintenanceRunning = true
  setBusy('totem maintenance', 'system')

  try {
    const result = await runTotemMaintenance(bot)
    if (!hasTotemInOffhand(bot)) {
      notifyAdminsTotemWarning(
        result?.reason === 'chest_empty'
          ? 'The supply chest has no Totems of Undying left.'
          : 'I could not equip a Totem of Undying.'
      )
    }
  } catch (error) {
    console.error('[TOTEM ERROR]', error)
    try { bot.pathfinder.setGoal(null) } catch {}
    notifyAdminsTotemWarning(`Automatic totem maintenance failed: ${error.message}`)
  } finally {
    clearBusy()
    totemMaintenanceRunning = false
  }
}

// =================================
// ARMOR / DEATH RECOVERY
// =================================

let pendingDeathRecovery = null
let armorRecoveryRunning = false
let lastKnownArmor = []
const armorWarnings = new Set()

function notifyAdmins(message) {
  for (const admin of admins) {
    sendMsg(admin, message)
  }
}

function checkArmorDurability() {
  if (!bot.entity || armorRecoveryRunning) return

  const currentSnapshot = snapshotArmor(bot)
  if (currentSnapshot.some(part => part.name)) {
    lastKnownArmor = currentSnapshot
  }

  const warningAt = Number(config.armor?.durabilityWarningPercent ?? 20)
  const resetAt = Number(config.armor?.durabilityResetPercent ?? 25)

  for (const armor of armorDurability(bot)) {
    const key = `${armor.destination}:${armor.name}`

    if (armor.percent <= warningAt && !armorWarnings.has(key)) {
      armorWarnings.add(key)
      notifyAdmins(`ARMOR WARNING: ${armor.name} is at ${armor.percent}% durability (${armor.remaining}/${armor.max}).`)
      console.log(`[ARMOR] Warnung: ${armor.name} ${armor.percent}%`)
    } else if (armor.percent >= resetAt) {
      armorWarnings.delete(key)
    }
  }
}

bot.on('death', () => {
  if (!bot.entity) return

  const position = bot.entity.position.clone()
  const currentArmor = snapshotArmor(bot)
  const armor = currentArmor.some(part => part.name)
    ? currentArmor
    : lastKnownArmor
  pendingDeathRecovery = { position, armor }

  console.log(`[ARMOR] Bot gestorben bei X=${position.x.toFixed(2)} Y=${position.y.toFixed(2)} Z=${position.z.toFixed(2)}`)

  try { bot.pathfinder.setGoal(null) } catch {}
  if (busy.active) clearBusy()
})

bot.on('spawn', () => {
  if (!pendingDeathRecovery || armorRecoveryRunning) return

  const recovery = pendingDeathRecovery
  pendingDeathRecovery = null
  armorRecoveryRunning = true
  setBusy('death recovery', 'system')

  setTimeout(async () => {
    try {
      const result = await recoverAfterDeath(bot, recovery.position, recovery.armor)
      if (result.missing.length > 0) {
        notifyAdmins(`ARMOR WARNING: I died and could not recover: ${result.missing.join(', ')}.`)
      } else if (result.expectedNames.length > 0) {
        notifyAdmins('Death recovery complete. I recovered and re-equipped my armor.')
      }
      checkArmorDurability()
    } catch (error) {
      console.error('[ARMOR RECOVERY ERROR]', error)
      try { bot.pathfinder.setGoal(null) } catch {}
      notifyAdmins(`ARMOR WARNING: Death recovery failed: ${error.message}`)
    } finally {
      clearBusy()
      armorRecoveryRunning = false
    }
  }, 250)
})

setInterval(
  checkArmorDurability,
  Number(config.armor?.checkIntervalMs ?? 30000)
)

// =================================
// SERVER-NACHRICHTEN VIA /msg
// =================================

function sendMsg(
  player,
  message
) {
  const safePlayer =
    String(player || '')
      .trim()

  const safeMessage =
    String(message || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()

  if (
    !safePlayer ||
    !safeMessage
  ) {
    return
  }

  console.log(
    `[OUT] /msg ${safePlayer} ${safeMessage}`
  )

  bot.chat(
    `/msg ${safePlayer} ${safeMessage}`
  )
}

// =================================
// LOCAL TERMINAL CHAT BRIDGE
// =================================

const terminalSocketPath =
  process.env.STASISBOT_SOCKET ||
  '/tmp/stasisbot.sock'

try {
  if (fs.existsSync(terminalSocketPath)) {
    fs.unlinkSync(terminalSocketPath)
  }
} catch (error) {
  console.error('[TERMINAL] Could not remove old socket:', error.message)
}

const terminalServer = net.createServer(socket => {
  let buffer = ''

  socket.setEncoding('utf8')

  socket.on('data', chunk => {
    buffer += chunk
    if (buffer.length > 8192) {
      socket.end('ERROR Message too large\n')
    }
  })

  socket.on('end', () => {
    try {
      const request = JSON.parse(buffer || '{}')

      if (!bot.entity) {
        socket.end('ERROR Bot is not connected to Minecraft.\n')
        return
      }

      if (request.type === 'chat') {
        const message = String(request.message || '')
          .replace(/[\r\n]+/g, ' ')
          .trim()

        if (!message) {
          socket.end('ERROR Empty message.\n')
          return
        }

        console.log(`[TERMINAL CHAT] ${message}`)
        bot.chat(message)
        socket.end('OK\n')
        return
      }

      if (request.type === 'msg') {
        const player = String(request.player || '').trim()
        const message = String(request.message || '')
          .replace(/[\r\n]+/g, ' ')
          .trim()

        if (!/^[A-Za-z0-9_]{1,16}$/.test(player) || !message) {
          socket.end('ERROR Invalid player or empty message.\n')
          return
        }

        console.log(`[TERMINAL MSG] ${player}: ${message}`)
        sendMsg(player, message)
        socket.end('OK\n')
        return
      }

      socket.end('ERROR Unknown request.\n')
    } catch (error) {
      socket.end(`ERROR ${error.message}\n`)
    }
  })
})

terminalServer.on('error', error => {
  console.error('[TERMINAL ERROR]', error)
})

terminalServer.listen(terminalSocketPath, () => {
  try {
    fs.chmodSync(terminalSocketPath, 0o600)
  } catch {
  }
  console.log(`[TERMINAL] Local command socket ready: ${terminalSocketPath}`)
})

// =================================
// LOGIN
// =================================

bot.once(
  'login',
  () => {
    console.log(
      '[LOGIN] Verbindung zum Server hergestellt.'
    )
  }
)

// =================================
// SPAWN
// =================================

bot.once(
  'spawn',
  () => {
    console.log(
      '[SPAWN] Bot ist der Welt beigetreten.'
    )

    const position =
      bot.entity.position

    console.log(
      `[POSITION] ` +
      `X=${position.x.toFixed(2)} ` +
      `Y=${position.y.toFixed(2)} ` +
      `Z=${position.z.toFixed(2)}`
    )

    try {
      const mcData =
        minecraftData(
          bot.version
        )

      const movements =
        new Movements(
          bot,
          mcData
        )

      bot.pathfinder.setMovements(
        movements
      )
    } catch (error) {
      console.error(
        '[PATHFINDER] Movements Fehler:',
        error
      )
    }

    console.log('')
    console.log(
      'StasisBot Phase 4 ist bereit.'
    )

    console.log('')
    console.log(
      'Befehle per Whisper:'
    )

    console.log('  ping')
    console.log('  status')
    console.log('  sleep')
    console.log('  pos [ADMIN]')
    console.log('  route [ADMIN]')
    console.log('  scan [ADMIN]')
    console.log('  checkregistry [ADMIN]')
    console.log('  createstasis')
    console.log('  removestasis')
    console.log('  pull')

    const foodCheckIntervalMs =
      Number(config.food?.checkIntervalMs ?? 5000)

    setTimeout(
      () => void maybeRunFoodMaintenance(),
      2000
    )

    setInterval(
      () => void maybeRunFoodMaintenance(),
      foodCheckIntervalMs
    )

    console.log(
      `[FOOD] Automatic food maintenance enabled. Chest: ` +
      `X=${config.food?.chest?.x} ` +
      `Y=${config.food?.chest?.y} ` +
      `Z=${config.food?.chest?.z}`
    )

    const totemCheckIntervalMs =
      Number(config.totem?.checkIntervalMs ?? 3000)

    setTimeout(
      () => void maybeRunTotemMaintenance(),
      2500
    )

    setInterval(
      () => void maybeRunTotemMaintenance(),
      totemCheckIntervalMs
    )

    console.log(
      `[TOTEM] Automatic offhand maintenance enabled. Chest: ` +
      `X=${config.totem?.chest?.x} ` +
      `Y=${config.totem?.chest?.y} ` +
      `Z=${config.totem?.chest?.z}`
    )
  }
)

// =================================
// WHISPER COMMANDS
// =================================

bot.on(
  'whisper',
  async (
    sender,
    message
  ) => {
    if (
      sender === bot.username
    ) {
      return
    }

    const rawMessage =
      String(message || '')
        .trim()

    const parts =
      rawMessage
        .split(/\s+/)
        .filter(Boolean)

    const command =
      String(parts[0] || '')
        .toLowerCase()

    const args =
      parts.slice(1)

    console.log(
      `[MSG] ${sender}: ${rawMessage}`
    )

    // =================================
    // ADMIN PERMISSION GATE
    // =================================

    if (
      ADMIN_ONLY_COMMANDS.has(command) &&
      !isAdmin(sender)
    ) {
      console.log(
        `[ADMIN] Zugriff verweigert: ${sender} -> ${command}`
      )

      sendMsg(
        sender,
        'You do not have permission to use this command.'
      )

      return
    }

    // =================================
    // BAN MANAGEMENT – ADMIN ONLY
    // =================================

    if (
      command === 'ban'
    ) {
      const targetPlayer =
        args[0]
          ? String(args[0]).trim()
          : ''

      if (
        args.length !== 1 ||
        !isValidPlayerName(targetPlayer)
      ) {
        sendMsg(
          sender,
          'Usage: ban <username>'
        )

        return
      }

      if (
        normalizePlayerName(targetPlayer) ===
        normalizePlayerName(bot.username)
      ) {
        sendMsg(
          sender,
          'The bot account cannot be banned.'
        )

        return
      }

      if (
        isAdmin(targetPlayer)
      ) {
        sendMsg(
          sender,
          'Admins cannot be banned from StasisBot.'
        )

        return
      }

      if (
        isBanned(targetPlayer)
      ) {
        sendMsg(
          sender,
          `${targetPlayer} is already banned from StasisBot.`
        )

        return
      }

      bans.set(
        normalizePlayerName(targetPlayer),
        targetPlayer
      )

      try {
        saveBans()
      } catch (error) {
        bans.delete(
          normalizePlayerName(targetPlayer)
        )

        console.error(
          '[BAN] Ban konnte nicht gespeichert werden:',
          error
        )

        sendMsg(
          sender,
          'The ban could not be saved. Nothing was changed.'
        )

        return
      }

      console.log(
        `[BAN] ${sender} banned ${targetPlayer}`
      )

      sendMsg(
        sender,
        `${targetPlayer} has been banned from StasisBot.`
      )

      return
    }

    if (
      command === 'unban'
    ) {
      const targetPlayer =
        args[0]
          ? String(args[0]).trim()
          : ''

      if (
        args.length !== 1 ||
        !isValidPlayerName(targetPlayer)
      ) {
        sendMsg(
          sender,
          'Usage: unban <username>'
        )

        return
      }

      const normalizedTarget =
        normalizePlayerName(targetPlayer)

      if (
        !bans.has(normalizedTarget)
      ) {
        sendMsg(
          sender,
          `${targetPlayer} is not banned from StasisBot.`
        )

        return
      }

      const savedName =
        bans.get(normalizedTarget)

      bans.delete(normalizedTarget)

      try {
        saveBans()
      } catch (error) {
        bans.set(
          normalizedTarget,
          savedName
        )

        console.error(
          '[BAN] Unban konnte nicht gespeichert werden:',
          error
        )

        sendMsg(
          sender,
          'The unban could not be saved. Nothing was changed.'
        )

        return
      }

      console.log(
        `[BAN] ${sender} unbanned ${savedName}`
      )

      sendMsg(
        sender,
        `${savedName} has been unbanned from StasisBot.`
      )

      return
    }

    if (
      command === 'banlist'
    ) {
      if (
        bans.size === 0
      ) {
        sendMsg(
          sender,
          'Ban list is empty.'
        )

        return
      }

      sendMsg(
        sender,
        `Banned users (${bans.size}): ${Array.from(bans.values()).join(', ')}`
      )

      return
    }

    // =================================
    // BANNED USER GATE
    // =================================

    if (
      isBanned(sender)
    ) {
      console.log(
        `[BAN] Zugriff verweigert: ${sender} -> ${command || '(empty)'}`
      )

      sendMsg(
        sender,
        'You are banned from using StasisBot.'
      )

      return
    }

    // =================================
    // PING
    // =================================

    if (
      command === 'ping'
    ) {
      sendMsg(
        sender,
        'pong'
      )

      return
    }

    // =================================
    // STATUS
    // =================================

    if (
      command === 'status'
    ) {
      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `Status: busy (${getBusyText()})`
        )
      } else {
        sendMsg(
          sender,
          'Status: idle'
        )
      }

      return
    }

    // =================================
    // SLEEP
    // =================================

    if (
      command === 'sleep'
    ) {
      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        'sleep',
        sender
      )

      try {
        sendMsg(
          sender,
          'Going to bed.'
        )

        await sleepInBed(
          bot
        )

        sendMsg(
          sender,
          'Good morning! I am awake again.'
        )
      } catch (error) {
        console.error(
          '[SLEEP ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        const reason =
          String(error?.message || '')
            .toLowerCase()

        if (
          reason.includes('not night') ||
          reason.includes("it's not night")
        ) {
          sendMsg(
            sender,
            'I can only sleep at night or during a thunderstorm.'
          )
        } else if (
          reason.includes('monsters nearby')
        ) {
          sendMsg(
            sender,
            'I cannot sleep because there are monsters nearby.'
          )
        } else if (
          reason.includes('occupied')
        ) {
          sendMsg(
            sender,
            'I cannot sleep because the bed is occupied.'
          )
        } else if (
          reason.includes('no bed found')
        ) {
          sendMsg(
            sender,
            'I cannot find my bed. Please contact an admin.'
          )
        } else {
          sendMsg(
            sender,
            'Sleeping failed. Please try again or contact an admin.'
          )
        }
      } finally {
        clearBusy()
      }

      return
    }

    // =================================
    // POSITION
    // =================================

    if (
      command === 'pos'
    ) {
      if (
        !isAdmin(sender)
      ) {
        sendMsg(
          sender,
          'You do not have permission to use this command.'
        )

        return
      }

      if (
        !bot.entity
      ) {
        sendMsg(
          sender,
          'Position is currently unavailable.'
        )

        return
      }

      const position =
        bot.entity.position

      sendMsg(
        sender,
        `X=${position.x.toFixed(2)} ` +
        `Y=${position.y.toFixed(2)} ` +
        `Z=${position.z.toFixed(2)}`
      )

      return
    }

    // =================================
    // ROUTE
    // =================================

    if (
      command === 'route'
    ) {
      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        'route',
        sender
      )

      try {
        sendMsg(
          sender,
          'Starting route.'
        )

        await executeRoute(
          bot
        )

        sendMsg(
          sender,
          'Route completed.'
        )
      } catch (error) {
        console.error(
          '[ROUTE ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        sendMsg(
          sender,
          'Route failed. Please try again or contact an admin.'
        )
      } finally {
        clearBusy()
      }

      return
    }

    // =================================
    // SCAN
    // =================================

    if (
      command === 'scan'
    ) {
      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        'scan',
        sender
      )

      try {
        sendMsg(
          sender,
          'Starting stasis scan.'
        )

        await scanStasis(
          bot
        )

        sendMsg(
          sender,
          'Stasis scan completed.'
        )
      } catch (error) {
        console.error(
          '[SCAN ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        sendMsg(
          sender,
          'Stasis scan failed. Please try again or contact an admin.'
        )
      } finally {
        clearBusy()
      }

      return
    }


    // =================================
    // PULL STASIS
    // Normal: pull
    // Admin: pull <username>
    // =================================

    if (
      command === 'pull'
    ) {
      const targetPlayer =
        args[0]
          ? String(args[0]).trim()
          : sender

      const own =
        targetPlayer.toLowerCase() ===
        String(sender).toLowerCase()

      // Maximal ein Username als Argument
      if (
        args.length > 1 ||
        !/^[A-Za-z0-9_]{1,16}$/.test(targetPlayer)
      ) {
        sendMsg(
          sender,
          isAdmin(sender)
            ? 'Usage: pull [username]'
            : 'Usage: pull'
        )

        return
      }

      // Normale Spieler dürfen nur ihre eigene Stasis pullen
      if (
        !own &&
        !isAdmin(sender)
      ) {
        sendMsg(
          sender,
          "You do not have permission to pull another player's stasis."
        )

        return
      }

      const stasis =
        getPlayerStasis(targetPlayer)

      if (
        !stasis
      ) {
        sendMsg(
          sender,
          own
            ? "You don't have a registered stasis yet. Use 'createstasis' first."
            : `${targetPlayer} does not have a registered stasis.`
        )

        return
      }

      const chamberId =
        Number(stasis.chamberId)

      if (
        !isValidChamberId(chamberId)
      ) {
        console.error(
          `[PULL] Ungültiger Registry-Eintrag für ${targetPlayer}:`,
          stasis
        )

        sendMsg(
          sender,
          own
            ? 'Your saved stasis assignment is invalid. Please contact an admin.'
            : `${targetPlayer}'s saved stasis assignment is invalid.`
        )

        return
      }

      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        `pull Stasis ${chamberId} for ${targetPlayer}`,
        sender
      )

      try {
        sendMsg(
          sender,
          own
            ? `Pulling your Stasis ${chamberId}.`
            : `Pulling ${targetPlayer}'s Stasis ${chamberId}.`
        )

        await pullStasis(
          bot,
          chamberId
        )

        sendMsg(
          sender,
          own
            ? `Your Stasis ${chamberId} has been pulled. Please place a new pearl in your stasis now.`
            : `${targetPlayer}'s Stasis ${chamberId} has been pulled. They should place a new pearl in their stasis now.`
        )
      } catch (error) {
        console.error(
          '[PULL ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        sendMsg(
          sender,
          'Pull failed. Please try again or contact an admin.'
        )
      } finally {
        clearBusy()
      }

      return
    }

    // =================================
    // REMOVE STASIS
    // Normal: removestasis
    // Admin: removestasis <username>
    // =================================

    if (
      command === 'removestasis'
    ) {
      const targetPlayer =
        args[0]
          ? String(args[0]).trim()
          : sender

      const own =
        targetPlayer.toLowerCase() ===
        String(sender).toLowerCase()

      // Maximal ein Username als Argument
      if (
        args.length > 1 ||
        !/^[A-Za-z0-9_]{1,16}$/.test(targetPlayer)
      ) {
        sendMsg(
          sender,
          isAdmin(sender)
            ? 'Usage: removestasis [username]'
            : 'Usage: removestasis'
        )

        return
      }

      // Normale Spieler dürfen nur ihre eigene Stasis entfernen
      if (
        !own &&
        !isAdmin(sender)
      ) {
        sendMsg(
          sender,
          "You do not have permission to remove another player's stasis."
        )

        return
      }

      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        `removestasis for ${targetPlayer}`,
        sender
      )

      try {
        const existing =
          getPlayerStasis(targetPlayer)

        if (
          !existing
        ) {
          sendMsg(
            sender,
            own
              ? "You don't have a registered stasis to remove."
              : `${targetPlayer} does not have a registered stasis to remove.`
          )

          return
        }

        sendMsg(
          sender,
          own
            ? `Removing your Stasis ${existing.chamberId}...`
            : `Removing ${targetPlayer}'s Stasis ${existing.chamberId}...`
        )

        const result =
          await removeStasis(
            bot,
            targetPlayer
          )

        if (
          result.status === 'not_found'
        ) {
          sendMsg(
            sender,
            own
              ? "You don't have a registered stasis to remove."
              : `${targetPlayer} does not have a registered stasis to remove.`
          )

          return
        }

        sendMsg(
          sender,
          own
            ? `Your Stasis ${result.chamberId} was removed successfully. The chamber is now free.`
            : `${targetPlayer}'s Stasis ${result.chamberId} was removed successfully. The chamber is now free.`
        )
      } catch (error) {
        console.error(
          '[REMOVE ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        sendMsg(
          sender,
          'Stasis removal failed. Nothing was removed from the registry unless the sign update succeeded. Please try again or contact an admin.'
        )
      } finally {
        clearBusy()
      }

      return
    }

    // =================================
    // REGISTRY / WORLD CONSISTENCY CHECK
    // =================================

    if (
      command === 'checkregistry'
    ) {
      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        'checkregistry',
        sender
      )

      try {
        sendMsg(
          sender,
          `Checking all ${getChamberCount()} stasis chambers against the registry...`
        )

        const result =
          await checkRegistryConsistency(
            bot
          )

        if (
          result.ok
        ) {
          sendMsg(
            sender,
            `Registry check passed: ${result.okOccupied} occupied and ${result.okFree} free chambers are consistent.`
          )
        } else {
          sendMsg(
            sender,
            `Registry check found ${result.issues.length} problem(s). Correct occupied: ${result.okOccupied}, correct free: ${result.okFree}.`
          )

          // Details are intentionally sent one issue per /msg so Minecraft's
          // chat-length limit cannot cut off the important part.
          const maxWhisperIssues = 8

          for (
            let i = 0;
            i < Math.min(result.issues.length, maxWhisperIssues);
            i++
          ) {
            sendMsg(
              sender,
              `Issue ${i + 1}: ${result.issues[i].message}`
            )
          }

          if (
            result.issues.length > maxWhisperIssues
          ) {
            sendMsg(
              sender,
              `${result.issues.length - maxWhisperIssues} more issue(s) are listed in the bot console.`
            )
          }
        }
      } catch (error) {
        console.error(
          '[CHECK ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        sendMsg(
          sender,
          'Registry check failed. Please try again or check the bot console.'
        )
      } finally {
        clearBusy()
      }

      return
    }

    // =================================
    // CREATE STASIS
    // Normal: createstasis
    // Admin: createstasis <username>
    // =================================

    if (
      command === 'createstasis'
    ) {
      const targetPlayer =
        args[0]
          ? String(args[0]).trim()
          : sender

      const own =
        targetPlayer.toLowerCase() ===
        String(sender).toLowerCase()

      // Maximal ein Username als Argument
      if (
        args.length > 1 ||
        !/^[A-Za-z0-9_]{1,16}$/.test(targetPlayer)
      ) {
        sendMsg(
          sender,
          isAdmin(sender)
            ? 'Usage: createstasis [username]'
            : 'Usage: createstasis'
        )

        return
      }

      // Normale Spieler dürfen nur ihre eigene Stasis erstellen
      if (
        !own &&
        !isAdmin(sender)
      ) {
        sendMsg(
          sender,
          'You do not have permission to create a stasis for another player.'
        )

        return
      }

      if (
        busy.active
      ) {
        sendMsg(
          sender,
          `I am already busy: ` +
          `${getBusyText()}.`
        )

        return
      }

      setBusy(
        `createstasis for ${targetPlayer}`,
        sender
      )

      try {
        sendMsg(
          sender,
          own
            ? 'Looking for a free stasis chamber...'
            : `Looking for a free stasis chamber for ${targetPlayer}...`
        )

        const result =
          await createStasis(
            bot,
            targetPlayer
          )

        if (
          result.status ===
          'already_exists'
        ) {
          sendMsg(
            sender,
            own
              ? `You already have Stasis ${result.chamberId}.`
              : `${targetPlayer} already has Stasis ${result.chamberId}.`
          )

          return
        }

        if (
          result.status ===
          'no_space'
        ) {
          sendMsg(
            sender,
            `All ${getChamberCount()} stasis chambers are currently occupied.`
          )

          return
        }

        if (
          result.status ===
          'created'
        ) {
          sendMsg(
            sender,
            own
              ? `Your stasis was created successfully. Your chamber is Stasis ${result.chamberId}.`
              : `${targetPlayer}'s stasis was created successfully. Their chamber is Stasis ${result.chamberId}.`
          )

          return
        }
      } catch (error) {
        console.error(
          '[CREATE ERROR]',
          error
        )

        try {
          bot.pathfinder.setGoal(null)
        } catch {
        }

        sendMsg(
          sender,
          'Stasis could not be created. Please try again or contact an admin.'
        )
      } finally {
        clearBusy()
      }

      return
    }

    // =================================
    // UNBEKANNTER BEFEHL
    // =================================

    sendMsg(
      sender,
      'Unknown command. ' +
      `Available: ${getAvailableCommands(sender)}`
    )
  }
)

// =================================
// CHAT LOG
// =================================

bot.on(
  'chat',
  (
    username,
    message
  ) => {
    if (
      username === bot.username
    ) {
      return
    }

    console.log(
      `[CHAT] ${username}: ${message}`
    )
  }
)

// =================================
// ERROR
// =================================

bot.on(
  'error',
  error => {
    console.error(
      '[ERROR]',
      error
    )
  }
)

// =================================
// KICKED
// =================================

bot.on(
  'kicked',
  reason => {
    console.log('')
    console.log('=================================')
    console.log('             KICKED')
    console.log('=================================')

    console.dir(
      reason,
      {
        depth: null
      }
    )

    console.log('=================================')
  }
)

// =================================
// END
// =================================

bot.on(
  'end',
  reason => {
    console.log(
      '[END] Verbindung beendet.' +
      (reason ? ` Grund: ${reason}` : '')
    )

    if (
      busy.active
    ) {
      clearBusy()
    }

    try { terminalServer.close() } catch {}
    try { if (fs.existsSync(terminalSocketPath)) fs.unlinkSync(terminalSocketPath) } catch {}

    // scripts/bootstrap.js supervises this process and reconnects after 60 seconds.
    setTimeout(
      () => process.exit(75),
      250
    )
  }
)
