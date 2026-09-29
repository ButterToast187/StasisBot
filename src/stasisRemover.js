const { Vec3 } = require('vec3')

const config = require('./config')
const registry = require('./registry')
const { isValidChamberId } = require('./chambers')

const {
  findSignsAtChamber
} = require('./scanner')

const {
  goToChamber,
  returnToStart
} = require('./stasis')

const {
  findChamberSign,
  getSignOwner,
  writeStasisSign
} = require('./stasisCreator')

async function removeStasis(bot, username) {
  console.log('')
  console.log('=================================')
  console.log('       REMOVE STASIS START')
  console.log('=================================')
  console.log(`[REMOVE] Spieler: ${username}`)

  const entry = registry.getPlayerStasis(username)

  if (!entry) {
    return {
      status: 'not_found'
    }
  }

  const chamberId = Number(entry.chamberId)

  if (
    !isValidChamberId(chamberId)
  ) {
    throw new Error(
      `Ungültige Chamber-ID in der Registry: ${entry.chamberId}`
    )
  }

  let moved = false

  try {
    await goToChamber(bot, chamberId)
    moved = true

    const signs = findSignsAtChamber(bot, chamberId)
    const sign = findChamberSign(signs, chamberId)

    if (!sign) {
      throw new Error(
        `Kein eindeutiges Schild für Stasis ${chamberId} gefunden.`
      )
    }

    const signOwner = getSignOwner(sign, chamberId)

    if (
      signOwner &&
      signOwner.toLowerCase() !== username.toLowerCase()
    ) {
      throw new Error(
        `Registry/World-Konflikt: Stasis ${chamberId} gehört laut Schild ${signOwner}.`
      )
    }

    const signBlock = bot.blockAt(
      new Vec3(
        sign.position.x,
        sign.position.y,
        sign.position.z
      )
    )

    if (!signBlock) {
      throw new Error(
        `Schildblock von Stasis ${chamberId} ist nicht geladen.`
      )
    }

    // Erst die Welt ändern und verifizieren. Die Registry wird bewusst
    // erst danach gelöscht, damit bei einem Fehler keine Zuordnung verloren geht.
    const success = await writeStasisSign(
      bot,
      chamberId,
      signBlock,
      ''
    )

    if (!success) {
      throw new Error(
        `Das Leeren des Schildes von Stasis ${chamberId} konnte nicht bestätigt werden.`
      )
    }

    const removed = registry.removePlayerStasis(username)

    if (!removed) {
      throw new Error(
        `Registry-Eintrag von ${username} konnte nicht entfernt werden.`
      )
    }

    console.log(
      `[REMOVE] ✓ ${username} wurde aus Stasis ${chamberId} entfernt.`
    )

    return {
      status: 'removed',
      chamberId
    }
  } finally {
    if (moved && bot.entity) {
      try {
        await returnToStart(bot)
      } catch (error) {
        console.error(
          '[REMOVE] Rückweg zum Start fehlgeschlagen:',
          error.message
        )
      }
    }

    console.log('')
    console.log('=================================')
    console.log('        REMOVE STASIS ENDE')
    console.log('=================================')
  }
}

module.exports = {
  removeStasis
}
