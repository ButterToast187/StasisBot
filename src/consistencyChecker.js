const config = require('./config')
const registry = require('./registry')
const route = require('./route')

const {
  findSignsAtChamber
} = require('./scanner')

const {
  goToChamber,
  returnToStart
} = require('./stasis')

const {
  findChamberSign,
  getSignOwner
} = require('./stasisCreator')

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
}

function buildRegistryMaps(entries) {
  const byChamber = new Map()
  const byPlayer = new Map()
  const duplicateChambers = new Map()

  for (const entry of entries) {
    const chamberId = Number(entry.chamberId)
    const username = String(entry.username || '').trim()

    if (!Number.isInteger(chamberId) || !username) {
      continue
    }

    const key = normalizeUsername(username)
    byPlayer.set(key, entry)

    if (byChamber.has(chamberId)) {
      if (!duplicateChambers.has(chamberId)) {
        duplicateChambers.set(
          chamberId,
          [byChamber.get(chamberId)]
        )
      }

      duplicateChambers.get(chamberId).push(entry)
    } else {
      byChamber.set(chamberId, entry)
    }
  }

  return {
    byChamber,
    byPlayer,
    duplicateChambers
  }
}

function makeIssue(type, chamberId, message, extra = {}) {
  return {
    type,
    chamberId,
    message,
    ...extra
  }
}

async function checkRegistryConsistency(bot) {
  console.log('')
  console.log('=================================')
  console.log('   REGISTRY/WORLD CHECK START')
  console.log('=================================')

  const entries = registry.getAllStasies()
  const {
    byChamber,
    byPlayer,
    duplicateChambers
  } = buildRegistryMaps(entries)

  const issues = []
  const chambers = []
  let okOccupied = 0
  let okFree = 0
  let moved = false

  for (const [chamberId, duplicateEntries] of duplicateChambers) {
    const names = duplicateEntries
      .map(entry => entry.username)
      .join(', ')

    issues.push(
      makeIssue(
        'registry_duplicate_chamber',
        chamberId,
        `Registry has multiple players assigned to Stasis ${chamberId}: ${names}`
      )
    )
  }

  try {
    for (const chamberId of route) {
      const chamber = config.chambers[chamberId]

      console.log('')
      console.log('---------------------------------')
      console.log(`[CHECK] STASIS ${chamberId}`)
      console.log('---------------------------------')

      if (!chamber) {
        const issue = makeIssue(
          'missing_config',
          chamberId,
          `Stasis ${chamberId} has no chamber configuration.`
        )

        issues.push(issue)
        chambers.push({ chamberId, status: 'error', issue })
        console.log(`[CHECK] ✗ ${issue.message}`)
        continue
      }

      try {
        await goToChamber(bot, chamberId)
        moved = true

        const signs = findSignsAtChamber(bot, chamberId)
        const sign = findChamberSign(signs, chamberId)
        const registryEntry = byChamber.get(chamberId) || null

        if (!sign) {
          const issue = makeIssue(
            'missing_or_ambiguous_sign',
            chamberId,
            `Stasis ${chamberId}: chamber sign is missing or ambiguous.`
          )

          issues.push(issue)
          chambers.push({ chamberId, status: 'error', issue })
          console.log(`[CHECK] ✗ ${issue.message}`)
          continue
        }

        const signOwner = getSignOwner(sign, chamberId)
        const registryOwner = registryEntry
          ? String(registryEntry.username || '').trim()
          : null

        if (!signOwner && !registryOwner) {
          okFree++
          chambers.push({
            chamberId,
            status: 'ok_free',
            signOwner: null,
            registryOwner: null
          })
          console.log('[CHECK] ✓ Frei in Welt und Registry')
          continue
        }

        if (
          signOwner &&
          registryOwner &&
          normalizeUsername(signOwner) === normalizeUsername(registryOwner)
        ) {
          okOccupied++
          chambers.push({
            chamberId,
            status: 'ok_occupied',
            signOwner,
            registryOwner
          })
          console.log(
            `[CHECK] ✓ ${signOwner} stimmt mit Registry überein.`
          )
          continue
        }

        if (signOwner && !registryOwner) {
          const ownerRegistryEntry = byPlayer.get(
            normalizeUsername(signOwner)
          )

          const message = ownerRegistryEntry
            ? `Stasis ${chamberId}: sign says ${signOwner}, but registry assigns that player to Stasis ${ownerRegistryEntry.chamberId}.`
            : `Stasis ${chamberId}: sign says ${signOwner}, but the chamber is free in the registry.`

          const issue = makeIssue(
            ownerRegistryEntry
              ? 'sign_player_assigned_elsewhere'
              : 'sign_only',
            chamberId,
            message,
            {
              signOwner,
              registryOwner: null
            }
          )

          issues.push(issue)
          chambers.push({ chamberId, status: 'mismatch', issue })
          console.log(`[CHECK] ✗ ${message}`)
          continue
        }

        if (!signOwner && registryOwner) {
          const issue = makeIssue(
            'registry_only',
            chamberId,
            `Stasis ${chamberId}: registry says ${registryOwner}, but the sign has no player name.`,
            {
              signOwner: null,
              registryOwner
            }
          )

          issues.push(issue)
          chambers.push({ chamberId, status: 'mismatch', issue })
          console.log(`[CHECK] ✗ ${issue.message}`)
          continue
        }

        const signOwnerRegistryEntry = byPlayer.get(
          normalizeUsername(signOwner)
        )

        let message =
          `Stasis ${chamberId}: sign says ${signOwner}, registry says ${registryOwner}.`

        if (signOwnerRegistryEntry) {
          message +=
            ` Registry assigns ${signOwner} to Stasis ${signOwnerRegistryEntry.chamberId}.`
        }

        const issue = makeIssue(
          'owner_mismatch',
          chamberId,
          message,
          {
            signOwner,
            registryOwner
          }
        )

        issues.push(issue)
        chambers.push({ chamberId, status: 'mismatch', issue })
        console.log(`[CHECK] ✗ ${message}`)
      } catch (error) {
        const issue = makeIssue(
          'scan_error',
          chamberId,
          `Stasis ${chamberId}: scan failed (${error.message}).`
        )

        issues.push(issue)
        chambers.push({ chamberId, status: 'error', issue })
        console.error(`[CHECK] ✗ ${issue.message}`)
      }
    }
  } finally {
    if (moved && bot.entity) {
      try {
        await returnToStart(bot)
      } catch (error) {
        console.error(
          '[CHECK] Rückweg zum Start fehlgeschlagen:',
          error.message
        )
      }
    }
  }

  console.log('')
  console.log('=================================')
  console.log('    REGISTRY/WORLD CHECK END')
  console.log('=================================')
  console.log(`[CHECK] Korrekt belegt: ${okOccupied}`)
  console.log(`[CHECK] Korrekt frei:   ${okFree}`)
  console.log(`[CHECK] Probleme:       ${issues.length}`)

  if (issues.length > 0) {
    console.log('')
    console.log('[CHECK] Gefundene Probleme:')

    issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue.message}`)
    })
  }

  return {
    ok: issues.length === 0,
    okOccupied,
    okFree,
    issues,
    chambers
  }
}

module.exports = {
  checkRegistryConsistency
}
