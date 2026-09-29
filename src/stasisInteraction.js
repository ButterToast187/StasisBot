const { Vec3 } = require('vec3')

const config = require('./config')
const { findSignsAtChamber } = require('./scanner')

const {
  goToChamber,
  returnToStart
} = require('./stasis')

// =================================
// EINSTELLUNGEN
// =================================

// Kurze Pause zwischen Auslösen und Reset.
const RESET_DELAY = 600

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

// =================================
// SCHILD + TRAPDOOR FINDEN
// =================================

function normalizeLine(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Sucht das tatsächlich vorhandene Schild der Chamber.
 *
 * Wichtig: Wir berechnen die Position NICHT mehr nur aus stand/lookAt.
 * Der bestehende Scanner sucht bereits einen kleinen Bereich um die Chamber
 * ab. Dadurch funktioniert die Interaktion auch dann, wenn der reale Aufbau
 * um einen Block von der theoretischen Position abweicht.
 */
function getChamberSign(bot, chamberId) {
  const signs = findSignsAtChamber(bot, chamberId)

  if (!Array.isArray(signs) || signs.length === 0) {
    throw new Error(
      `Bei Stasis ${chamberId} wurde kein Schild gefunden.`
    )
  }

  const expected = `stasis ${chamberId}`

  const exactMatch = signs.find(sign =>
    Array.isArray(sign.text) &&
    sign.text.some(line => normalizeLine(line) === expected)
  )

  // Falls nur ein Schild in diesem kleinen Chamber-Bereich liegt,
  // können wir es sicher verwenden. Das hilft auch bei abweichender
  // Groß-/Kleinschreibung oder älteren Schildformaten.
  const sign = exactMatch || (signs.length === 1 ? signs[0] : null)

  if (!sign) {
    const found = signs
      .map(entry => {
        const text = Array.isArray(entry.text)
          ? entry.text.join(' | ')
          : '<leer>'

        return `(${entry.position.x}, ${entry.position.y}, ${entry.position.z}): ${text}`
      })
      .join('; ')

    throw new Error(
      `Mehrere Schilder bei Stasis ${chamberId} gefunden, ` +
      `aber keines eindeutig als "Stasis ${chamberId}" erkannt. ` +
      `Gefunden: ${found}`
    )
  }

  console.log(
    `[PULL] Schild Stasis ${chamberId}: ` +
    `X=${sign.position.x} ` +
    `Y=${sign.position.y} ` +
    `Z=${sign.position.z}`
  )

  return sign
}

/**
 * Die Trapdoor befindet sich 1 Block unter UND 1 Block hinter dem Schild.
 *
 * "Hinter" bedeutet: vom Standpunkt des Bots aus gesehen noch einen Block
 * weiter in Richtung Chamber. Dadurch funktioniert dieselbe Berechnung für
 * beide gegenüberliegenden Chamber-Seiten.
 */
function getTrapdoorPositionFromSign(sign, chamber) {
  const dx = sign.position.x - chamber.stand.x
  const dz = sign.position.z - chamber.stand.z

  let behindX = 0
  let behindZ = 0

  // Die Chambers liegen sich horizontal gegenüber. Wir nehmen die dominante
  // Achse zwischen Standpunkt und Schild als Blick-/Chamber-Richtung.
  if (Math.abs(dx) >= Math.abs(dz)) {
    behindX = Math.sign(dx)
  } else {
    behindZ = Math.sign(dz)
  }

  if (behindX === 0 && behindZ === 0) {
    throw new Error('Richtung hinter dem Schild konnte nicht bestimmt werden.')
  }

  return new Vec3(
    sign.position.x + behindX,
    sign.position.y - 1,
    sign.position.z + behindZ
  )
}

function getChamberTrapdoor(bot, chamberId) {
  const chamber = config.chambers[chamberId]

  if (!chamber) {
    throw new Error(
      `Keine Konfiguration für Stasis ${chamberId}`
    )
  }

  const sign = getChamberSign(bot, chamberId)
  const position = getTrapdoorPositionFromSign(sign, chamber)
  const block = bot.blockAt(position)

  console.log(
    `[PULL] Trapdoor 1 Block unter + 1 Block hinter Schild: ` +
    `X=${position.x} ` +
    `Y=${position.y} ` +
    `Z=${position.z}`
  )

  if (!block) {
    throw new Error(
      `Trapdoor von Stasis ${chamberId} ist nicht geladen.`
    )
  }

  if (!block.name || !block.name.includes('trapdoor')) {
    throw new Error(
      `Unter/hinter dem Schild von Stasis ${chamberId} ` +
      `befindet sich keine Trapdoor, sondern: ${block.name || 'unbekannt'}`
    )
  }

  console.log(
    `[PULL] ✓ Trapdoor erkannt: ${block.name}`
  )

  return block
}

// =================================
// EINZELNER KLICK
// =================================

async function clickTrapdoor(bot, chamberId, label) {
  // Bei jedem Klick neu aus der Welt lesen.
  const trapdoor = getChamberTrapdoor(bot, chamberId)

  const center = trapdoor.position.offset(
    0.5,
    0.5,
    0.5
  )

  await bot.lookAt(center, true)

  console.log(
    `[PULL] ${label}: Trapdoor wird rechtsgeklickt...`
  )

  await bot.activateBlock(trapdoor)

  console.log(
    `[PULL] ${label}: ✓ Klick gesendet`
  )
}

// =================================
// STASIS AUSLÖSEN + RESETTEN
// =================================

async function triggerAndResetStasis(
  bot,
  chamberId,
  mode = 'TESTPULL'
) {
  console.log('')
  console.log('=================================')
  console.log(`       ${mode} STASIS ${chamberId}`)
  console.log('=================================')

  await goToChamber(bot, chamberId)

  // 1. Klick: Stasis auslösen
  await clickTrapdoor(
    bot,
    chamberId,
    'AUSLÖSEN'
  )

  await sleep(RESET_DELAY)

  // 2. Klick: dieselbe Trapdoor resetten
  await clickTrapdoor(
    bot,
    chamberId,
    'RESET'
  )

  console.log(
    `[PULL] ✓ Stasis ${chamberId} ausgelöst und Trapdoor zurückgesetzt.`
  )

  return true
}

/**
 * Testablauf inklusive Rückkehr zum Startpunkt.
 */
async function testPull(bot, chamberId) {
  try {
    await triggerAndResetStasis(
      bot,
      chamberId,
      'TESTPULL'
    )
  } finally {
    // Auch wenn die Interaktion fehlschlägt,
    // versuchen wir zum Start zurückzukehren.
    try {
      await returnToStart(bot)
    } catch (returnError) {
      console.error(
        '[PULL] Rückkehr zum Start fehlgeschlagen:',
        returnError.message
      )
    }
  }
}


/**
 * Echter Pull-Ablauf inklusive Rückkehr zum Startpunkt.
 * Die Chamber-ID kommt vorher aus der Registry des Whisper-Absenders.
 */
async function pullStasis(bot, chamberId) {
  try {
    await triggerAndResetStasis(
      bot,
      chamberId,
      'PULL'
    )
  } finally {
    try {
      await returnToStart(bot)
    } catch (returnError) {
      console.error(
        '[PULL] Rückkehr zum Start fehlgeschlagen:',
        returnError.message
      )
    }
  }
}

module.exports = {
  getChamberSign,
  getTrapdoorPositionFromSign,
  getChamberTrapdoor,
  triggerAndResetStasis,
  testPull,
  pullStasis
}
