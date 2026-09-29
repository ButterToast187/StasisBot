const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')

function distance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z

  return Math.sqrt(
    dx * dx +
    dy * dy +
    dz * dz
  )
}

async function moveTo(bot, position) {
  console.log(
    `[MOVE] → X=${position.x} Y=${position.y} Z=${position.z}`
  )

  const goal = new goals.GoalNear(
    position.x,
    position.y,
    position.z,
    1
  )

  bot.pathfinder.setGoal(goal)

  await new Promise((resolve, reject) => {
    let finished = false

    const timeout = setTimeout(() => {
      if (finished) return

      finished = true
      cleanup()

      reject(new Error('Bewegungs-Timeout'))
    }, 30000)

    function cleanup() {
      clearTimeout(timeout)

      bot.removeListener('goal_reached', onReached)
      bot.removeListener('path_reset', onReset)
    }

    function onReached() {
      if (finished) return

      finished = true
      cleanup()

      resolve()
    }

    function onReset(reason) {
      if (finished) return

      console.log(
        `[MOVE] Pathfinder zurückgesetzt: ${reason}`
      )

      // block_updated ist normalerweise kein fataler Fehler.
      // Der Pathfinder berechnet den Weg neu.
      if (reason === 'block_updated') {
        return
      }

      // Andere path_reset-Gründe behandeln wir als Fehler,
      // sofern der Pathfinder nicht bereits weiterläuft.
      if (bot.pathfinder.isMoving()) {
        return
      }

      finished = true
      cleanup()

      reject(
        new Error(`Path wurde zurückgesetzt: ${reason}`)
      )
    }

    bot.once('goal_reached', onReached)
    bot.on('path_reset', onReset)
  })

  bot.pathfinder.setGoal(null)

  console.log(
    `[MOVE] ✓ Ziel erreicht (${distance(
      bot.entity.position,
      position
    ).toFixed(2)} Blöcke entfernt)`
  )
}

async function lookAt(bot, position) {
  console.log(
    `[LOOK] → X=${position.x} Y=${position.y} Z=${position.z}`
  )

  const point = new Vec3(
    position.x,
    position.y,
    position.z
  )

  await bot.lookAt(point, true)

  console.log('[LOOK] ✓ Ausgerichtet')
}

module.exports = {
  moveTo,
  lookAt
}