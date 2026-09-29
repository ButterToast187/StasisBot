const { goals } = require('mineflayer-pathfinder')
const config = require('./config')
const { moveTo } = require('./movement')

const ARMOR_SLOTS = [
  { destination: 'head', slot: 5, suffix: '_helmet' },
  { destination: 'torso', slot: 6, suffix: '_chestplate' },
  { destination: 'legs', slot: 7, suffix: '_leggings' },
  { destination: 'feet', slot: 8, suffix: '_boots' }
]

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function getEquippedArmor(bot) {
  return ARMOR_SLOTS.map(part => ({
    ...part,
    item: bot.inventory.slots[part.slot] || null
  }))
}

function snapshotArmor(bot) {
  return getEquippedArmor(bot).map(part => ({
    destination: part.destination,
    suffix: part.suffix,
    name: part.item ? part.item.name : null
  }))
}

function itemEntityStack(entity) {
  try {
    if (typeof entity.getDroppedItem === 'function') return entity.getDroppedItem()
  } catch {}
  return null
}

async function collectExpectedDrops(bot, deathPosition, expectedNames) {
  const radius = Number(config.armor?.recoveryRadius ?? 8)
  const deadline = Date.now() + Number(config.armor?.recoveryTimeoutMs ?? 20000)

  while (Date.now() < deadline) {
    const wanted = new Set(expectedNames.filter(Boolean))
    const entities = Object.values(bot.entities || {})
      .filter(entity => entity && entity.name === 'item' && entity.position)
      .map(entity => ({ entity, stack: itemEntityStack(entity) }))
      .filter(({ entity, stack }) => {
        if (!stack || !wanted.has(stack.name)) return false
        return entity.position.distanceTo(deathPosition) <= radius
      })
      .sort((a, b) =>
        a.entity.position.distanceTo(bot.entity.position) -
        b.entity.position.distanceTo(bot.entity.position)
      )

    if (entities.length === 0) break

    const target = entities[0].entity
    console.log(`[ARMOR] Sammle ${entities[0].stack.name} bei X=${target.position.x.toFixed(1)} Y=${target.position.y.toFixed(1)} Z=${target.position.z.toFixed(1)}`)
    bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 0.5))
    await wait(1200)
    bot.pathfinder.setGoal(null)
    await wait(250)
  }
}

async function equipArmor(bot, snapshot) {
  const results = []
  for (const part of snapshot) {
    if (!part.name) continue
    const already = bot.inventory.slots[ARMOR_SLOTS.find(x => x.destination === part.destination).slot]
    if (already && already.name === part.name) {
      results.push(part.name)
      continue
    }
    const item = bot.inventory.items().find(candidate => candidate.name === part.name)
    if (!item) continue
    await bot.equip(item, part.destination)
    console.log(`[ARMOR] ✓ ${part.name} wieder angezogen`)
    results.push(part.name)
    await wait(150)
  }
  return results
}

async function recoverAfterDeath(bot, deathPosition, armorSnapshot) {
  console.log(`[ARMOR] Todes-Recovery startet bei X=${deathPosition.x.toFixed(1)} Y=${deathPosition.y.toFixed(1)} Z=${deathPosition.z.toFixed(1)}`)
  await wait(Number(config.armor?.respawnDelayMs ?? 1500))
  await moveTo(bot, deathPosition)
  await wait(1000)
  const expectedNames = armorSnapshot.map(x => x.name).filter(Boolean)
  await collectExpectedDrops(bot, deathPosition, expectedNames)
  await wait(500)
  const equipped = await equipArmor(bot, armorSnapshot)
  const missing = expectedNames.filter(name => !equipped.includes(name))
  try { await moveTo(bot, config.start) } catch (error) { console.error('[ARMOR] Rückweg fehlgeschlagen:', error.message) }
  return { expectedNames, equipped, missing }
}

function armorDurability(bot) {
  return getEquippedArmor(bot)
    .filter(part => part.item && Number(part.item.maxDurability) > 0)
    .map(part => {
      const max = Number(part.item.maxDurability)
      const used = Number(part.item.durabilityUsed || 0)
      const remaining = Math.max(0, max - used)
      return {
        destination: part.destination,
        name: part.item.name,
        remaining,
        max,
        percent: Math.round((remaining / max) * 100)
      }
    })
}

module.exports = { snapshotArmor, recoverAfterDeath, armorDurability }
