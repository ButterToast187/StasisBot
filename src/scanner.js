const { Vec3 } = require('vec3')
const config = require('./config')
const { moveTo, lookAt } = require('./movement')
const route = require('./route')

/**
 * Prüft, ob ein Block ein Schild ist.
 */
function isSign(block) {
  if (!block || !block.name) {
    return false
  }

  return (
    block.name.includes('sign') ||
    block.name.includes('hanging_sign')
  )
}

/**
 * Liest den Text eines Schildes aus.
 *
 * Je nach Mineflayer-Version kann der Text
 * an unterschiedlichen Stellen verfügbar sein.
 */
function readSignText(block) {
  if (!block) {
    return []
  }

  // Neuere Mineflayer-Versionen
  if (block.signText) {
    if (Array.isArray(block.signText)) {
      return block.signText
    }

    if (typeof block.signText === 'string') {
      return [block.signText]
    }
  }

  // Alternative Datenstruktur
  if (block.entity) {
    if (Array.isArray(block.entity.text)) {
      return block.entity.text
    }

    if (typeof block.entity.text === 'string') {
      return [block.entity.text]
    }

    if (typeof block.entity.signText === 'string') {
      return [block.entity.signText]
    }
  }

  return []
}

/**
 * Entfernt Minecraft-Formatierungszeichen und
 * macht aus JSON-Text möglichst normalen Text.
 */
function cleanText(text) {
  if (!text) {
    return ''
  }

  let result = String(text)

  // JSON/Text-Components versuchen zu dekodieren
  try {
    const parsed = JSON.parse(result)

    if (typeof parsed === 'string') {
      result = parsed
    } else if (parsed && typeof parsed.text === 'string') {
      result = parsed.text
    } else if (parsed && Array.isArray(parsed.extra)) {
      result = parsed.extra
        .map(part => {
          if (typeof part === 'string') {
            return part
          }

          return part.text || ''
        })
        .join('')
    }
  } catch {
    // Kein JSON → normaler Text
  }

  // Minecraft-Formatierung entfernen
  result = result.replace(/§[0-9a-fk-or]/gi, '')

  return result.trim()
}

/**
 * Berechnet die Position des Schildes.
 *
 * Die Richtung wird automatisch aus stand und lookAt
 * bestimmt.
 *
 * Das Schild befindet sich:
 * - 2 Blöcke von der Standposition in Blickrichtung
 * - 1 Block höher
 */
function getSignPosition(chamber) {
  const stand = chamber.stand
  const lookAt = chamber.lookAt

  // Blickrichtung bestimmen
  const directionX = Math.sign(lookAt.x - stand.x)
  const directionZ = Math.sign(lookAt.z - stand.z)

  return new Vec3(
    stand.x + directionX * 2,
    stand.y + 1,
    stand.z + directionZ * 2
  )
}

/**
 * Sucht Schilder direkt bei einer Stasis.
 */
function findSignsAtChamber(bot, chamberId) {
  const chamber = config.chambers[chamberId]

  if (!chamber) {
    throw new Error(
      `Keine Konfiguration für Stasis ${chamberId}`
    )
  }

  const signPosition = getSignPosition(chamber)

  console.log(
    `[SCAN] Erwartete Schildposition: ` +
    `X=${signPosition.x} ` +
    `Y=${signPosition.y} ` +
    `Z=${signPosition.z}`
  )

  const foundSigns = []

  /*
   * Kleinen Bereich um die erwartete
   * Schildposition durchsuchen.
   */
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const position = signPosition.offset(
          dx,
          dy,
          dz
        )

        const block = bot.blockAt(position)

        if (!isSign(block)) {
          continue
        }

        const textLines = readSignText(block)
          .map(cleanText)
          .filter(Boolean)

        foundSigns.push({
          position: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          text: textLines
        })
      }
    }
  }

  return foundSigns
}

/**
 * Scannt alle konfigurierten Stasies.
 */
async function scanStasis(bot) {
  console.log('')
  console.log('=================================')
  console.log('       STASIS SCAN START')
  console.log('=================================')

  const results = {}

  // Dynamische Route: erst alle linken, dann alle rechten Chambers.
  for (const chamberId of route) {
    const chamber = config.chambers[chamberId]

    if (!chamber) {
      console.log(
        `[SCAN] Stasis ${chamberId}: Konfiguration fehlt`
      )
      continue
    }

    console.log('')
    console.log('---------------------------------')
    console.log(`[SCAN] STASIS ${chamberId}`)
    console.log('---------------------------------')

    try {
      // Zur Chamber laufen
      await moveTo(bot, chamber.stand)

      // Zur Chamber schauen
      await lookAt(bot, chamber.lookAt)

      // Schilder suchen
      const signs = findSignsAtChamber(
        bot,
        chamberId
      )

      results[chamberId] = signs

      if (signs.length === 0) {
        console.log(
          `[SCAN] Stasis ${chamberId}: ` +
          `keine Schilder gefunden.`
        )

        continue
      }

      console.log(
        `[SCAN] Stasis ${chamberId}: ` +
        `${signs.length} Schild(er) gefunden.`
      )

      for (const sign of signs) {
        console.log('')

        console.log(
          `[SIGN] X=${sign.position.x} ` +
          `Y=${sign.position.y} ` +
          `Z=${sign.position.z}`
        )

        if (sign.text.length === 0) {
          console.log(
            '       Text: <leer>'
          )
        } else {
          for (const line of sign.text) {
            console.log(
              `       ${line}`
            )
          }
        }
      }
    } catch (error) {
      console.error(
        `[SCAN ERROR] Stasis ${chamberId}:`,
        error.message
      )

      results[chamberId] = {
        error: error.message
      }
    }
  }

  console.log('')
  console.log('=================================')
  console.log('        STASIS SCAN ENDE')
  console.log('=================================')

  return results
}

module.exports = {
  scanStasis,
  findSignsAtChamber
}