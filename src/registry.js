const { getChamberIds } = require('./chambers')

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'stasis.json')

function createEmptyData() {
  return {
    players: {}
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true
    })
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(createEmptyData(), null, 2),
      'utf8'
    )

    console.log(
      `[REGISTRY] Neue Datenbank erstellt: ${DATA_FILE}`
    )
  }
}

function loadData() {
  ensureDataFile()

  try {
    const content = fs.readFileSync(
      DATA_FILE,
      'utf8'
    )

    const data = JSON.parse(content)

    if (!data.players) {
      data.players = {}
    }

    return data
  } catch (error) {
    console.error(
      '[REGISTRY] Fehler beim Laden:',
      error
    )

    throw new Error(
      'Stasis-Datenbank konnte nicht geladen werden.'
    )
  }
}

function saveData(data) {
  ensureDataFile()

  const tempFile = DATA_FILE + '.tmp'

  fs.writeFileSync(
    tempFile,
    JSON.stringify(data, null, 2),
    'utf8'
  )

  fs.renameSync(
    tempFile,
    DATA_FILE
  )
}

/**
 * Minecraft-Namen werden für die Suche
 * kleingeschrieben.
 *
 * Die originale Schreibweise wird trotzdem
 * separat gespeichert.
 */
function normalizeUsername(username) {
  return username
    .trim()
    .toLowerCase()
}

/**
 * Sucht die Stasis eines Spielers.
 */
function getPlayerStasis(username) {
  const data = loadData()

  const key = normalizeUsername(username)

  return data.players[key] || null
}

/**
 * Prüft, ob ein Spieler schon eine Stasis besitzt.
 */
function hasPlayerStasis(username) {
  return getPlayerStasis(username) !== null
}

/**
 * Gibt alle bereits belegten Chamber-IDs zurück.
 */
function getUsedChambers() {
  const data = loadData()

  return new Set(
    Object.values(data.players)
      .map(entry => entry.chamberId)
  )
}

/**
 * Sucht die erste laut Datenbank freie Chamber.
 */
function getFirstFreeChamber(maxChambers = null) {
  const used = getUsedChambers()
  let chamberIds = getChamberIds()

  if (Number.isInteger(maxChambers)) {
    chamberIds = chamberIds.filter(
      chamberId => chamberId <= maxChambers
    )
  }

  for (const chamberId of chamberIds) {
    if (!used.has(chamberId)) {
      return chamberId
    }
  }

  return null
}

/**
 * Speichert eine neue Stasis-Zuordnung.
 */
function assignStasis(username, chamberId) {
  const data = loadData()

  const key = normalizeUsername(username)

  // Spieler hat schon eine Stasis
  if (data.players[key]) {
    throw new Error(
      `${username} besitzt bereits eine Stasis.`
    )
  }

  // Prüfen, ob Chamber bereits benutzt wird
  for (const entry of Object.values(data.players)) {
    if (entry.chamberId === chamberId) {
      throw new Error(
        `Chamber ${chamberId} ist bereits belegt.`
      )
    }
  }

  data.players[key] = {
    username,
    chamberId
  }

  saveData(data)

  console.log(
    `[REGISTRY] ${username} -> Stasis ${chamberId}`
  )

  return data.players[key]
}

/**
 * Später für deletestasis bereits nützlich.
 */
function removePlayerStasis(username) {
  const data = loadData()

  const key = normalizeUsername(username)

  if (!data.players[key]) {
    return false
  }

  delete data.players[key]

  saveData(data)

  return true
}

/**
 * Alle Registrierungen zurückgeben.
 */
function getAllStasies() {
  const data = loadData()

  return Object.values(data.players)
}

module.exports = {
  loadData,
  getPlayerStasis,
  hasPlayerStasis,
  getUsedChambers,
  getFirstFreeChamber,
  assignStasis,
  removePlayerStasis,
  getAllStasies
}