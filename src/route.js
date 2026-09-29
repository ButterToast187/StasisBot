const { getChamberRoute } = require('./chambers')

// Dynamisch aus config.chambers erzeugt.
// Aktuelle Reihenfolge: erst alle linken, dann alle rechten Chambers.
module.exports = getChamberRoute()
