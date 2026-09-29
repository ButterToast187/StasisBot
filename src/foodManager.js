const { Vec3 } = require('vec3')
const config = require('./config')
const { moveTo } = require('./movement')

function getFoodConfig() {
  return config.food || {}
}

function getPriority() {
  const priority = getFoodConfig().priority

  if (!Array.isArray(priority)) {
    return []
  }

  return priority
    .map(name => String(name || '').trim())
    .filter(Boolean)
}

function countInventoryFood(bot) {
  const allowed = new Set(getPriority())

  return bot.inventory
    .items()
    .filter(item => allowed.has(item.name))
    .reduce((sum, item) => sum + item.count, 0)
}

function findInventoryFood(bot) {
  const items = bot.inventory.items()

  for (const name of getPriority()) {
    const item = items.find(candidate => candidate.name === name)

    if (item) {
      return item
    }
  }

  return null
}

function findChestFood(container) {
  const items = container.containerItems()

  for (const name of getPriority()) {
    const matching = items.filter(item => item.name === name)

    if (matching.length > 0) {
      return {
        name,
        type: matching[0].type,
        count: matching.reduce((sum, item) => sum + item.count, 0)
      }
    }
  }

  return null
}

async function eatIfNeeded(bot) {
  const food = getFoodConfig()
  const threshold = Number(food.eatAtOrBelow ?? 14)

  if (!bot.entity || typeof bot.food !== 'number' || bot.food > threshold) {
    return {
      ate: false,
      reason: 'not_needed'
    }
  }

  const item = findInventoryFood(bot)

  if (!item) {
    console.log(
      `[FOOD] Hunger ${bot.food}/20, aber kein geeignetes Essen im Inventar.`
    )

    return {
      ate: false,
      reason: 'no_food'
    }
  }

  console.log(
    `[FOOD] Hunger ${bot.food}/20 -> esse ${item.name}.`
  )

  await bot.equip(item, 'hand')
  await bot.consume()

  console.log(
    `[FOOD] Essen abgeschlossen. Hunger: ${bot.food}/20.`
  )

  return {
    ate: true,
    reason: 'ate'
  }
}

async function refillFood(bot) {
  const food = getFoodConfig()
  const chestPosition = food.chest
  const refillBelow = Number(food.refillBelow ?? 16)
  const targetAmount = Number(food.targetAmount ?? 64)

  const currentAmount = countInventoryFood(bot)

  if (currentAmount >= refillBelow) {
    return {
      refilled: false,
      reason: 'enough_food',
      amount: currentAmount
    }
  }

  if (!chestPosition) {
    throw new Error('Keine Food-Chest in config.js konfiguriert.')
  }

  console.log(
    `[FOOD] Nur noch ${currentAmount} Food-Item(s) im Inventar. Fülle auf.`
  )

  await moveTo(bot, chestPosition)

  const chestBlock = bot.blockAt(
    new Vec3(
      chestPosition.x,
      chestPosition.y,
      chestPosition.z
    )
  )

  if (!chestBlock) {
    throw new Error(
      `Food-Chest bei X=${chestPosition.x} Y=${chestPosition.y} Z=${chestPosition.z} wurde nicht gefunden.`
    )
  }

  if (!['chest', 'trapped_chest', 'barrel'].includes(chestBlock.name)) {
    throw new Error(
      `Block an der Food-Position ist '${chestBlock.name}' statt einer Kiste/Barrel.`
    )
  }

  let container = null

  try {
    container = await bot.openContainer(chestBlock)

    let inventoryAmount = countInventoryFood(bot)

    while (inventoryAmount < targetAmount) {
      const chestFood = findChestFood(container)

      if (!chestFood) {
        console.log('[FOOD] Die Food-Chest enthält kein unterstütztes Essen mehr.')
        break
      }

      const wanted = targetAmount - inventoryAmount
      const takeAmount = Math.min(wanted, chestFood.count)

      if (takeAmount <= 0) {
        break
      }

      console.log(
        `[FOOD] Nehme ${takeAmount}x ${chestFood.name} aus der Kiste.`
      )

      await container.withdraw(
        chestFood.type,
        null,
        takeAmount
      )

      const newAmount = countInventoryFood(bot)

      if (newAmount <= inventoryAmount) {
        console.log('[FOOD] Inventarbestand hat sich nicht erhöht; breche Nachfüllen ab.')
        break
      }

      inventoryAmount = newAmount
    }

    console.log(
      `[FOOD] Vorrat nach dem Nachfüllen: ${inventoryAmount} Item(s).`
    )

    return {
      refilled: inventoryAmount > currentAmount,
      reason: inventoryAmount > currentAmount ? 'refilled' : 'chest_empty',
      amount: inventoryAmount
    }
  } finally {
    if (container) {
      try {
        container.close()
      } catch {
      }
    }
  }
}

async function runFoodMaintenance(bot) {
  const food = getFoodConfig()
  const refillBelow = Number(food.refillBelow ?? 16)
  const shouldVisitChest = countInventoryFood(bot) < refillBelow

  // If hunger is already low and food is available, eat before walking anywhere.
  await eatIfNeeded(bot)

  let refillResult = {
    refilled: false,
    reason: 'enough_food',
    amount: countInventoryFood(bot)
  }

  try {
    refillResult = await refillFood(bot)

    // If there was no food before the refill, eat immediately afterwards.
    await eatIfNeeded(bot)

    return refillResult
  } finally {
    if (shouldVisitChest && config.start && bot.entity) {
      try {
        console.log('[FOOD] Kehre zur Startposition zurück.')
        await moveTo(bot, config.start)
      } catch (error) {
        console.error(
          '[FOOD] Rückkehr zur Startposition fehlgeschlagen:',
          error.message
        )
      }
    }
  }
}

module.exports = {
  countInventoryFood,
  eatIfNeeded,
  refillFood,
  runFoodMaintenance
}
