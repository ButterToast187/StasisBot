const config = require('./config')
const route = require('./route')
const { moveTo, lookAt } = require('./movement')

async function goToChamber(bot, chamberId) {
  const chamber = config.chambers[chamberId]

  if (!chamber) {
    throw new Error(
      `Keine Konfiguration für Stasis ${chamberId}`
    )
  }

  console.log('')
  console.log('---------------------------------')
  console.log(`[STASIS ${chamberId}] Anfahren`)
  console.log('---------------------------------')

  await moveTo(bot, chamber.stand)
  await lookAt(bot, chamber.lookAt)

  console.log(`[STASIS ${chamberId}] ✓ Position erreicht`)

  return true
}

async function returnToStart(bot) {
  console.log('')
  console.log('[ROUTE] ← Zurück zum Ausgangspunkt')

  await moveTo(bot, config.start)

  console.log('[ROUTE] ✓ Ausgangspunkt erreicht')
}

async function executeRoute(bot) {
  console.log('')
  console.log('=================================')
  console.log('       STASIS ROUTE START')
  console.log('=================================')

  console.log('[ROUTE] Ausgangspunkt')
  console.log(
    `X=${config.start.x} ` +
    `Y=${config.start.y} ` +
    `Z=${config.start.z}`
  )

  // Sicherheit: zuerst zum Startpunkt.
  await moveTo(bot, config.start)

  // Dynamische Raumroute aus config.chambers:
  // zuerst alle linken, danach alle rechten Chambers.
  for (const chamberId of route) {
    console.log('')
    console.log(`[ROUTE] → Stasis ${chamberId}`)

    await goToChamber(bot, chamberId)
  }

  // Am Ende zurück zum Ausgangspunkt.
  await returnToStart(bot)

  console.log('')
  console.log('=================================')
  console.log('       STASIS ROUTE ENDE')
  console.log('=================================')
}

module.exports = {
  goToChamber,
  executeRoute,
  returnToStart
}
