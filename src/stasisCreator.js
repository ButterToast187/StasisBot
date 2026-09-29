const { Vec3 } = require('vec3')

const config = require('./config')

const {
  findSignsAtChamber
} = require('./scanner')

const {
  goToChamber,
  returnToStart
} = require('./stasis')

const registry = require('./registry')
const route = require('./route')

// =================================
// EINSTELLUNGEN
// =================================

const SIGN_OPEN_TIMEOUT = 3000
const VERIFY_ATTEMPTS = 8
const VERIFY_DELAY = 300

// =================================
// INTERACTION SEQUENCE
// =================================

let interactionSequence = 0

function getNextInteractionSequence() {
  interactionSequence++

  if (
    interactionSequence >
    2147483647
  ) {
    interactionSequence = 1
  }

  return interactionSequence
}

// =================================
// HILFSFUNKTIONEN
// =================================

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function samePosition(
  a,
  b
) {
  if (
    !a ||
    !b
  ) {
    return false
  }

  return (
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z
  )
}

// =================================
// CHAMBER-SCHILD FINDEN
// =================================

function findChamberSign(
  signs,
  chamberId
) {
  const expectedText =
    `stasis ${chamberId}`
      .toLowerCase()

  const exactSign =
    signs.find(sign => {
      return sign.text.some(
        line =>
          line
            .trim()
            .toLowerCase() ===
          expectedText
      )
    })

  if (
    exactSign
  ) {
    return exactSign
  }

  if (
    signs.length === 1
  ) {
    return signs[0]
  }

  return null
}

// =================================
// SCHILD-BESITZER
// =================================

function getSignOwner(
  sign,
  chamberId
) {
  const chamberText =
    `stasis ${chamberId}`
      .toLowerCase()

  // Je nach Minecraft-/Mineflayer-Version kann der Schildtext entweder
  // als einzelne Array-Zeilen oder als ein String mit \n ankommen.
  // Deshalb normalisieren wir zuerst immer auf echte Einzelzeilen.
  const normalizedLines =
    (sign?.text || [])
      .flatMap(line =>
        String(line || '')
          .split(/\r?\n/)
      )
      .map(line => line.trim())
      .filter(Boolean)

  const otherLines =
    normalizedLines.filter(line => {
      return (
        line.toLowerCase() !== chamberText
      )
    })

  if (
    otherLines.length === 0
  ) {
    return null
  }

  return otherLines[0]
}

// =================================
// SCHILDTEXT LESEN
// =================================

function readBlockSignText(
  block
) {
  if (
    !block
  ) {
    return {
      front: '',
      back: ''
    }
  }

  if (
    typeof block.getSignText ===
    'function'
  ) {
    try {
      const text =
        block.getSignText()

      if (
        Array.isArray(text)
      ) {
        return {
          front:
            String(
              text[0] || ''
            ),

          back:
            String(
              text[1] || ''
            )
        }
      }

      if (
        typeof text ===
        'string'
      ) {
        return {
          front: text,
          back: ''
        }
      }
    } catch {
    }
  }

  if (
    block.signText
  ) {
    if (
      Array.isArray(
        block.signText
      )
    ) {
      return {
        front:
          block.signText
            .join('\n'),

        back: ''
      }
    }

    if (
      typeof block.signText ===
      'string'
    ) {
      return {
        front:
          block.signText,

        back: ''
      }
    }
  }

  return {
    front: '',
    back: ''
  }
}

// =================================
// AUF SCHILDEDITOR WARTEN
// =================================

function waitForSignOpen(
  bot,
  expectedPosition,
  timeout = SIGN_OPEN_TIMEOUT
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let finished = false
      let timer = null

      const cleanup = () => {
        bot.removeListener(
          'signOpen',
          onMineflayerSignOpen
        )

        bot._client.removeListener(
          'packet',
          onPacket
        )

        if (
          timer
        ) {
          clearTimeout(
            timer
          )
        }
      }

      const resolveOnce =
        block => {
          if (
            finished
          ) {
            return
          }

          finished = true

          cleanup()

          resolve(
            block
          )
        }

      const rejectOnce =
        error => {
          if (
            finished
          ) {
            return
          }

          finished = true

          cleanup()

          reject(
            error
          )
        }

      // -----------------------------
      // Mineflayer Event
      // -----------------------------

      const onMineflayerSignOpen =
        block => {
          if (
            !block
          ) {
            return
          }

          if (
            !samePosition(
              block.position,
              expectedPosition
            )
          ) {
            return
          }

          resolveOnce(
            block
          )
        }

      // -----------------------------
      // Minecraft 26.2 RAW Event
      // -----------------------------

      const onPacket =
        (
          data,
          meta
        ) => {
          if (
            meta?.name !==
            'open_sign_entity'
          ) {
            return
          }

          if (
            !data ||
            !data.location
          ) {
            return
          }

          if (
            !samePosition(
              data.location,
              expectedPosition
            )
          ) {
            return
          }

          const signBlock =
            bot.blockAt(
              new Vec3(
                data.location.x,
                data.location.y,
                data.location.z
              )
            )

          if (
            !signBlock
          ) {
            rejectOnce(
              new Error(
                'Schildeditor wurde geöffnet, ' +
                'aber der Schildblock konnte nicht geladen werden.'
              )
            )

            return
          }

          resolveOnce(
            signBlock
          )
        }

      bot.on(
        'signOpen',
        onMineflayerSignOpen
      )

      bot._client.on(
        'packet',
        onPacket
      )

      timer =
        setTimeout(
          () => {
            rejectOnce(
              new Error(
                'Der Server hat den ' +
                'Schildeditor nicht geöffnet.'
              )
            )
          },
          timeout
        )
    }
  )
}

// =================================
// AUF SCHILD SCHAUEN
// =================================

async function lookAtSign(
  bot,
  signBlock
) {
  const center =
    signBlock.position.offset(
      0.5,
      0.5,
      0.5
    )

  await bot.lookAt(
    center,
    true
  )

  await sleep(
    250
  )
}

// =================================
// FALLBACK FÜR FACING
// =================================

function getFallbackFace(
  bot,
  signBlock
) {
  const botPos =
    bot.entity.position

  const signPos =
    signBlock.position

  const centerX =
    signPos.x + 0.5

  const centerZ =
    signPos.z + 0.5

  const diffX =
    botPos.x - centerX

  const diffZ =
    botPos.z - centerZ

  if (
    Math.abs(diffX) >=
    Math.abs(diffZ)
  ) {
    return (
      diffX < 0
        ? 'west'
        : 'east'
    )
  }

  return (
    diffZ < 0
      ? 'north'
      : 'south'
  )
}

// =================================
// SCHILDAUSRICHTUNG
// =================================

function getSignFacing(
  bot,
  signBlock
) {
  try {
    if (
      typeof signBlock.getProperties ===
      'function'
    ) {
      const properties =
        signBlock.getProperties()

      const facing =
        properties?.facing

      if (
        facing === 'north' ||
        facing === 'south' ||
        facing === 'west' ||
        facing === 'east'
      ) {
        return facing
      }
    }
  } catch {
  }

  return getFallbackFace(
    bot,
    signBlock
  )
}

// =================================
// INTERAKTION
// =================================

function calculateInteraction(
  bot,
  signBlock
) {
  const facing =
    getSignFacing(
      bot,
      signBlock
    )

  let direction

  let cursorX = 0.5
  let cursorY = 0.5
  let cursorZ = 0.5

  switch (
    facing
  ) {
    case 'north':
      direction = 2
      cursorZ = 0.001
      break

    case 'south':
      direction = 3
      cursorZ = 0.999
      break

    case 'west':
      direction = 4
      cursorX = 0.001
      break

    case 'east':
      direction = 5
      cursorX = 0.999
      break

    default:
      throw new Error(
        `Unbekannte Schildrichtung: ${facing}`
      )
  }

  return {
    direction,
    cursorX,
    cursorY,
    cursorZ
  }
}

// =================================
// SCHILDEDITOR ÖFFNEN
// =================================

async function openSignEditor(
  bot,
  signBlock
) {
  const {
    direction,
    cursorX,
    cursorY,
    cursorZ
  } =
    calculateInteraction(
      bot,
      signBlock
    )

  const sequence =
    getNextInteractionSequence()

  const signOpenPromise =
    waitForSignOpen(
      bot,
      signBlock.position
    )

  try {
    bot._client.write(
      'block_place',
      {
        hand: 0,

        location: {
          x:
            signBlock.position.x,

          y:
            signBlock.position.y,

          z:
            signBlock.position.z
        },

        direction,

        cursorX,
        cursorY,
        cursorZ,

        insideBlock:
          false,

        worldBorderHit:
          false,

        sequence
      }
    )
  } catch (error) {
    signOpenPromise.catch(
      () => {}
    )

    throw new Error(
      `Schild konnte nicht geöffnet werden: ` +
      `${error.message}`
    )
  }

  return await signOpenPromise
}

// =================================
// SCHILDUPDATE PRÜFEN
// =================================

async function verifySignUpdate(
  bot,
  signPosition,
  chamberId,
  username
) {
  const expectedUsername =
    username
      .trim()
      .toLowerCase()

  for (
    let attempt = 1;
    attempt <= VERIFY_ATTEMPTS;
    attempt++
  ) {
    await sleep(
      VERIFY_DELAY
    )

    const block =
      bot.blockAt(
        signPosition
      )

    if (
      !block
    ) {
      continue
    }

    const signText =
      readBlockSignText(
        block
      )

    const combined =
      `${signText.front}\n${signText.back}`
        .toLowerCase()

    if (expectedUsername.length > 0) {
      if (
        combined.includes(
          expectedUsername
        )
      ) {
        return true
      }
    } else {
      const expectedChamber =
        `stasis ${chamberId}`
          .toLowerCase()

      const lines =
        combined
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)

      if (
        lines.includes(expectedChamber) &&
        lines.every(line => line === expectedChamber)
      ) {
        return true
      }
    }
  }

  return false
}

// =================================
// SCHILD BESCHREIBEN
// =================================

async function writeStasisSign(
  bot,
  chamberId,
  signBlock,
  username
) {
  await lookAtSign(
    bot,
    signBlock
  )

  const openedSign =
    await openSignEditor(
      bot,
      signBlock
    )

  const newText =
    `Stasis ${chamberId}\n${username}`

  bot.updateSign(
    openedSign,
    newText,
    false
  )

  return await verifySignUpdate(
    bot,
    signBlock.position,
    chamberId,
    username
  )
}

// =================================
// CREATE STASIS
// =================================

async function createStasis(
  bot,
  username
) {
  console.log('')
  console.log('=================================')
  console.log('       CREATE STASIS START')
  console.log('=================================')

  console.log(
    `[CREATE] Spieler: ${username}`
  )

  // =================================
  // SPIELER BEREITS REGISTRIERT?
  // =================================

  const existing =
    registry.getPlayerStasis(
      username
    )

  if (
    existing
  ) {
    console.log(
      `[CREATE] ${username} besitzt bereits ` +
      `Stasis ${existing.chamberId}.`
    )

    return {
      status:
        'already_exists',

      chamberId:
        existing.chamberId
    }
  }

  // =================================
  // BELEGTE CHAMBERS
  // =================================

  const usedChambers =
    registry.getUsedChambers()

  let moved = false

  try {
    // =================================
    // ALLE KONFIGURIERTEN CHAMBERS
    // =================================

    for (const chamberId of route) {
      if (
        usedChambers.has(
          chamberId
        )
      ) {
        console.log(
          `[CREATE] Stasis ${chamberId}: ` +
          `laut Datenbank belegt.`
        )

        continue
      }

      if (
        !config.chambers[
          chamberId
        ]
      ) {
        console.log(
          `[CREATE] Stasis ${chamberId}: ` +
          `keine Config vorhanden.`
        )

        continue
      }

      console.log('')
      console.log(
        `[CREATE] Prüfe Stasis ${chamberId}...`
      )

      // -----------------------------
      // Hinfahren
      // -----------------------------

      await goToChamber(
        bot,
        chamberId
      )

      moved = true

      // -----------------------------
      // Schild finden
      // -----------------------------

      const signs =
        findSignsAtChamber(
          bot,
          chamberId
        )

      const sign =
        findChamberSign(
          signs,
          chamberId
        )

      if (
        !sign
      ) {
        console.log(
          `[CREATE] Stasis ${chamberId}: ` +
          `kein eindeutiges Schild gefunden.`
        )

        continue
      }

      // -----------------------------
      // Physisch belegt?
      // -----------------------------

      const existingOwner =
        getSignOwner(
          sign,
          chamberId
        )

      if (
        existingOwner
      ) {
        console.log(
          `[CREATE] Stasis ${chamberId}: ` +
          `bereits belegt durch ` +
          `${existingOwner}.`
        )

        continue
      }

      // -----------------------------
      // Schildblock laden
      // -----------------------------

      const signPosition =
        new Vec3(
          sign.position.x,
          sign.position.y,
          sign.position.z
        )

      const signBlock =
        bot.blockAt(
          signPosition
        )

      if (
        !signBlock
      ) {
        console.log(
          `[CREATE] Stasis ${chamberId}: ` +
          `Schildblock nicht geladen.`
        )

        continue
      }

      console.log(
        `[CREATE] Freie Stasis gefunden: ${chamberId}`
      )

      // -----------------------------
      // Schild beschreiben
      // -----------------------------

      const success =
        await writeStasisSign(
          bot,
          chamberId,
          signBlock,
          username
        )

      if (
        !success
      ) {
        throw new Error(
          `Der neue Schildtext von ` +
          `Stasis ${chamberId} ` +
          `konnte nicht bestätigt werden.`
        )
      }

      console.log(
        '[CREATE] ✓ Schild erfolgreich beschrieben.'
      )

      // -----------------------------
      // Registry speichern
      // -----------------------------

      registry.assignStasis(
        username,
        chamberId
      )

      console.log(
        `[CREATE] ✓ ${username} wurde ` +
        `Stasis ${chamberId} zugeordnet.`
      )

      return {
        status:
          'created',

        chamberId
      }
    }

    console.log(
      '[CREATE] Keine freie Stasis verfügbar.'
    )

    return {
      status:
        'no_space'
    }
  } finally {
    // =================================
    // ZURÜCK ZUM START
    // =================================

    if (
      moved &&
      bot.entity
    ) {
      try {
        await returnToStart(
          bot
        )
      } catch (error) {
        console.error(
          '[CREATE] Rückweg zum Start fehlgeschlagen:',
          error.message
        )
      }
    }

    console.log('')
    console.log('=================================')
    console.log('        CREATE STASIS ENDE')
    console.log('=================================')
  }
}

// =================================
// EXPORT
// =================================

module.exports = {
  createStasis,
  findChamberSign,
  getSignOwner,
  writeStasisSign
}