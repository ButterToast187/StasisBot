const config = require('./config')

function getChamberIds() {
  return Object.keys(config.chambers || {})
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b)
}

function getChamberCount() {
  return getChamberIds().length
}

function isValidChamberId(chamberId) {
  const id = Number(chamberId)

  return (
    Number.isInteger(id) &&
    Object.prototype.hasOwnProperty.call(config.chambers || {}, id)
  )
}

function getChamberRoute() {
  return getChamberIds().sort((a, b) => {
    const chamberA = config.chambers[a]
    const chamberB = config.chambers[b]

    // Bei der aktuellen Raumaufteilung zeigt die linke Seite Richtung
    // höherer X-Werte (48314) und die rechte Richtung niedrigerer (48306).
    // Dadurch werden automatisch erst alle linken und dann alle rechten
    // Chambers abgearbeitet, auch wenn später weitere hinzukommen.
    const lookXA = Number(chamberA?.lookAt?.x ?? 0)
    const lookXB = Number(chamberB?.lookAt?.x ?? 0)

    if (lookXA !== lookXB) {
      return lookXB - lookXA
    }

    const zA = Number(chamberA?.stand?.z ?? 0)
    const zB = Number(chamberB?.stand?.z ?? 0)

    if (zA !== zB) {
      return zA - zB
    }

    return a - b
  })
}

module.exports = {
  getChamberIds,
  getChamberCount,
  getChamberRoute,
  isValidChamberId
}
