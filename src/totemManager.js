const { Vec3 } = require('vec3')
const config = require('./config')
const { moveTo } = require('./movement')

const TOTEM_NAME = 'totem_of_undying'

function getTotemConfig() {
  return config.totem || {}
}

function inventoryTotems(bot) {
  return bot.inventory.items().filter(item => item.name === TOTEM_NAME)
}

function countInventoryTotems(bot) {
  return inventoryTotems(bot).reduce((sum, item) => sum + item.count, 0)
}

function getOffhandItem(bot) {
  // Mineflayer exposes the off-hand slot through inventory.slots.
  // Slot 45 is the vanilla offhand inventory slot for player inventories.
  return bot.inventory?.slots?.[45] || null
}

function hasTotemInOffhand(bot) {
  return getOffhandItem(bot)?.name === TOTEM_NAME
}

async function equipTotem(bot) {
  if (!bot.entity || hasTotemInOffhand(bot)) {
    return hasTotemInOffhand(bot)
  }

  const totem = inventoryTotems(bot)[0]
  if (!totem) return false

  await bot.equip(totem, 'off-hand')
  console.log('[TOTEM] Totem in Offhand ausgerüstet.')
  return true
}

function findChestTotems(container) {
  const matches = container.containerItems().filter(item => item.name === TOTEM_NAME)
  if (!matches.length) return null
  return {
    type: matches[0].type,
    count: matches.reduce((sum, item) => sum + item.count, 0)
  }
}

async function refillTotems(bot) {
  const cfg = getTotemConfig()
  const chestPosition = cfg.chest || config.food?.chest
  const targetAmount = Math.max(1, Number(cfg.targetInventoryAmount ?? 4))
  const refillBelow = Math.max(0, Number(cfg.refillBelow ?? 1))
  const currentAmount = countInventoryTotems(bot)

  if (hasTotemInOffhand(bot) && currentAmount >= refillBelow) {
    return { refilled: false, reason: 'enough_totems', amount: currentAmount }
  }

  if (!chestPosition) throw new Error('Keine Totem/Food-Chest konfiguriert.')

  console.log(`[TOTEM] Vorrat ${currentAmount}; fülle Totems aus der Kiste auf.`)
  await moveTo(bot, chestPosition)

  const chestBlock = bot.blockAt(new Vec3(chestPosition.x, chestPosition.y, chestPosition.z))
  if (!chestBlock || !['chest', 'trapped_chest', 'barrel'].includes(chestBlock.name)) {
    throw new Error(`Totem-Chest bei X=${chestPosition.x} Y=${chestPosition.y} Z=${chestPosition.z} nicht gefunden.`)
  }

  let container = null
  try {
    container = await bot.openContainer(chestBlock)
    const chestTotems = findChestTotems(container)
    if (!chestTotems) {
      console.log('[TOTEM] Keine Totems mehr in der Kiste.')
      return { refilled: false, reason: 'chest_empty', amount: currentAmount }
    }

    const wanted = Math.max(0, targetAmount - currentAmount)
    const takeAmount = Math.min(wanted, chestTotems.count)
    if (takeAmount > 0) {
      console.log(`[TOTEM] Nehme ${takeAmount}x Totem of Undying aus der Kiste.`)
      await container.withdraw(chestTotems.type, null, takeAmount)
    }

    return {
      refilled: takeAmount > 0,
      reason: takeAmount > 0 ? 'refilled' : 'enough_totems',
      amount: countInventoryTotems(bot)
    }
  } finally {
    if (container) {
      try { container.close() } catch {}
    }
  }
}

async function runTotemMaintenance(bot) {
  const needChest = !hasTotemInOffhand(bot) && countInventoryTotems(bot) === 0
    || countInventoryTotems(bot) < Number(getTotemConfig().refillBelow ?? 1)

  // First use a spare already in inventory.
  await equipTotem(bot)

  let result = { refilled: false, reason: 'enough_totems', amount: countInventoryTotems(bot) }

  try {
    if (!hasTotemInOffhand(bot) || countInventoryTotems(bot) < Number(getTotemConfig().refillBelow ?? 1)) {
      result = await refillTotems(bot)
      await equipTotem(bot)
    }
    return result
  } finally {
    if (needChest && config.start && bot.entity) {
      try {
        console.log('[TOTEM] Kehre zur Startposition zurück.')
        await moveTo(bot, config.start)
      } catch (error) {
        console.error('[TOTEM] Rückkehr fehlgeschlagen:', error.message)
      }
    }
  }
}

module.exports = {
  countInventoryTotems,
  hasTotemInOffhand,
  equipTotem,
  refillTotems,
  runTotemMaintenance
}
