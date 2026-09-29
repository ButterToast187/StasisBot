const { Vec3 } = require('vec3')

const config = require('./config')

const {
  moveTo
} = require('./movement')

function getBedPosition() {
  const bed = config.sleep?.bed

  if (
    !bed ||
    !Number.isFinite(Number(bed.x)) ||
    !Number.isFinite(Number(bed.y)) ||
    !Number.isFinite(Number(bed.z))
  ) {
    throw new Error('sleep bed is not configured')
  }

  return new Vec3(
    Number(bed.x),
    Number(bed.y),
    Number(bed.z)
  )
}

function waitForWake(bot) {
  return new Promise((resolve) => {
    bot.once('wake', resolve)
  })
}

async function sleepInBed(bot) {
  if (!bot.entity) {
    throw new Error('bot is not spawned')
  }

  if (bot.isSleeping) {
    throw new Error('already sleeping')
  }

  console.log('[SLEEP] → Gehe zum Schlafplatz')

  await moveTo(
    bot,
    config.start
  )

  const bedPosition = getBedPosition()
  const bed = bot.blockAt(bedPosition)

  if (
    !bed ||
    !bot.isABed(bed)
  ) {
    throw new Error(
      `no bed found at X=${bedPosition.x} Y=${bedPosition.y} Z=${bedPosition.z}`
    )
  }

  console.log(
    `[SLEEP] ✓ Bett gefunden: ${bed.name} ` +
    `X=${bed.position.x} Y=${bed.position.y} Z=${bed.position.z}`
  )

  // Listener vor dem Klick registrieren, damit ein sehr schneller
  // Nacht-Skip kein wake-Event verpasst.
  const wakePromise = waitForWake(bot)

  console.log('[SLEEP] Bett wird benutzt...')
  await bot.sleep(bed)
  console.log('[SLEEP] ✓ Bot schläft')

  await wakePromise
  console.log('[SLEEP] ✓ Bot ist wieder wach')

  await moveTo(
    bot,
    config.start
  )

  console.log('[SLEEP] ✓ Ausgangspunkt erreicht')
}

module.exports = {
  sleepInBed
}
