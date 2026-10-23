.pragma library

var ENDPOINT_KEYS = [
  "id", "name", "icon",
  "baseUrl", "localUrl", "trustedNetwork", "demoMode", "favorites",
  "demoFavorites", "roomReadings", "demoRoomReadings",
  "pinnedRoomReadings", "demoPinnedRoomReadings",
  "panelOrder", "demoPanelOrder",
  "groupByArea", "showEntityIcons", "showPanelPinOnHover", "selectedTab",
  "displayNameOverrides", "iconOverrides"
]

var ROOT_KEYS = [
  "activeEndpointId", "endpoints"
]

function stringList(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice()
  var out = []
  var seen = {}
  for (var i = 0; i < value.length; i++) {
    if (typeof value[i] === "string"
        && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(value[i])
        && !seen[value[i]]) {
      seen[value[i]] = true
      out.push(value[i])
    }
  }
  return out
}

function deviceList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < value.length; i++) {
    var id = value[i]
    if (typeof id !== "string" || !id
        || id === "__proto__" || id === "constructor" || id === "prototype"
        || !/^[A-Za-z0-9_.:-]+$/.test(id) || seen[id]) continue
    seen[id] = true
    out.push(id)
  }
  return out
}

function panelItemList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < value.length; i++) {
    var id = value[i]
    var valid = typeof id === "string"
      && (/^[a-z0-9_]+\.[a-z0-9_]+$/.test(id)
          || /^room_reading:[A-Za-z0-9_.:-]+$/.test(id))
    if (!valid || seen[id]) continue
    seen[id] = true
    out.push(id)
  }
  return out
}

function normalizedPanelOrder(value, favorites, roomReadings) {
  var selected = {}
  for (var f = 0; f < favorites.length; f++) selected[favorites[f]] = true
  for (var r = 0; r < roomReadings.length; r++) {
    selected["room_reading:" + roomReadings[r]] = true
  }

  var requested = panelItemList(value)
  var out = []
  var included = {}
  for (var i = 0; i < requested.length; i++) {
    if (selected[requested[i]]) {
      out.push(requested[i])
      included[requested[i]] = true
    }
  }
  // Old configurations had no combined order. Preserve the existing entity
  // order and append newly selected room cards, which is where a newly starred
  // item belongs.
  for (var e = 0; e < favorites.length; e++) {
    if (!included[favorites[e]]) out.push(favorites[e])
  }
  for (var d = 0; d < roomReadings.length; d++) {
    var key = "room_reading:" + roomReadings[d]
    if (!included[key]) out.push(key)
  }
  return out
}

function selectedDevices(value, roomReadings) {
  var requested = deviceList(value)
  var selected = {}
  for (var i = 0; i < roomReadings.length; i++) selected[roomReadings[i]] = true
  return requested.filter(function(id) { return selected[id] === true })
}

function plainMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  var out = {}
  for (var key in value) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue
    if (typeof value[key] === "string") out[key] = value[key]
  }
  return out
}

function sanitizeId(value, fallback) {
  if (typeof value !== "string") return fallback || "default"
  var id = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_")
  if (!id || id === "__proto__" || id === "constructor" || id === "prototype") {
    return fallback || "default"
  }
  return id
}

function normalizeEndpoint(raw, demoDefaults, fallbackId, fallbackName) {
  raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  var id = sanitizeId(raw.id, fallbackId || "default")
  var name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : (fallbackName || "Home")
  var icon = typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : "home"

  var favorites = stringList(raw.favorites, [])
  var demoFavorites = stringList(raw.demoFavorites,
                                 Array.isArray(demoDefaults) ? demoDefaults : [])
  var roomReadings = deviceList(raw.roomReadings)
  var demoRoomReadings = deviceList(raw.demoRoomReadings)

  return {
    id: id,
    name: name,
    icon: icon,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : "",
    localUrl: typeof raw.localUrl === "string" ? raw.localUrl : "",
    trustedNetwork: typeof raw.trustedNetwork === "string" ? raw.trustedNetwork : "",
    demoMode: raw.demoMode === true,
    favorites: favorites,
    demoFavorites: demoFavorites,
    roomReadings: roomReadings,
    demoRoomReadings: demoRoomReadings,
    pinnedRoomReadings: selectedDevices(raw.pinnedRoomReadings, roomReadings),
    demoPinnedRoomReadings: selectedDevices(
      raw.demoPinnedRoomReadings, demoRoomReadings),
    panelOrder: normalizedPanelOrder(raw.panelOrder, favorites, roomReadings),
    demoPanelOrder: normalizedPanelOrder(
      raw.demoPanelOrder, demoFavorites, demoRoomReadings),
    groupByArea: raw.groupByArea === true,
    showEntityIcons: raw.showEntityIcons !== false,
    showPanelPinOnHover: raw.showPanelPinOnHover === true,
    selectedTab: typeof raw.selectedTab === "string" && raw.selectedTab
      ? raw.selectedTab : "favorites",
    displayNameOverrides: plainMap(raw.displayNameOverrides),
    iconOverrides: plainMap(raw.iconOverrides)
  }
}

function parse(text, demoDefaults) {
  var raw = {}
  var error = ""
  try {
    raw = text ? JSON.parse(text) : {}
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      raw = {}
      error = "config.json must contain a JSON object"
    }
  } catch (exception) {
    raw = {}
    error = "config.json is not valid JSON"
  }

  var endpoints = {}
  var activeEndpointId = ""

  if (raw.endpoints && typeof raw.endpoints === "object" && !Array.isArray(raw.endpoints)) {
    var rawEndpoints = raw.endpoints
    for (var key in rawEndpoints) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue
      var ep = normalizeEndpoint(rawEndpoints[key], demoDefaults, key, key)
      endpoints[ep.id] = ep
    }
  }

  // If no valid endpoints were found under raw.endpoints, migrate legacy root configuration
  var endpointIds = Object.keys(endpoints)
  if (endpointIds.length === 0) {
    var defaultEp = normalizeEndpoint(raw, demoDefaults, "default", "Home")
    endpoints[defaultEp.id] = defaultEp
    endpointIds = [defaultEp.id]
  }

  if (typeof raw.activeEndpointId === "string" && endpoints[raw.activeEndpointId]) {
    activeEndpointId = raw.activeEndpointId
  } else {
    activeEndpointId = endpointIds[0]
  }

  return {
    error: error,
    config: {
      activeEndpointId: activeEndpointId,
      endpoints: endpoints
    }
  }
}

function activeEndpoint(config) {
  if (!config || !config.endpoints) return null
  var id = config.activeEndpointId
  if (id && config.endpoints[id]) return config.endpoints[id]
  for (var key in config.endpoints) {
    return config.endpoints[key]
  }
  return null
}

function merge(current, patch) {
  current = current && current.endpoints ? current : parse("{}").config
  patch = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}

  var resultEndpoints = {}
  var currentEndpoints = current.endpoints || {}
  for (var id in currentEndpoints) {
    resultEndpoints[id] = normalizeEndpoint(currentEndpoints[id], null, id, currentEndpoints[id].name)
  }

  var activeId = current.activeEndpointId || Object.keys(resultEndpoints)[0] || "default"
  if (typeof patch.activeEndpointId === "string" && (patch.activeEndpointId in resultEndpoints || (patch.endpoints && patch.activeEndpointId in patch.endpoints))) {
    activeId = patch.activeEndpointId
  }

  // Handle explicit endpoints update in patch
  if (patch.endpoints && typeof patch.endpoints === "object" && !Array.isArray(patch.endpoints)) {
    for (var pId in patch.endpoints) {
      if (pId === "__proto__" || pId === "constructor" || pId === "prototype") continue
      var patchVal = patch.endpoints[pId]
      if (patchVal === null || patchVal === undefined) {
        // Deletion request: only delete if more than 1 endpoint remains
        if (Object.keys(resultEndpoints).length > 1) {
          delete resultEndpoints[pId]
        }
      } else {
        var base = resultEndpoints[pId] || normalizeEndpoint({}, null, pId, patchVal.name || pId)
        var merged = {}
        for (var k = 0; k < ENDPOINT_KEYS.length; k++) {
          var key = ENDPOINT_KEYS[k]
          merged[key] = Object.prototype.hasOwnProperty.call(patchVal, key) ? patchVal[key] : base[key]
        }
        resultEndpoints[pId] = normalizeEndpoint(merged, null, pId, merged.name)
      }
    }
  }

  // Handle targeted single-endpoint patch: { endpointId: "...", patch: { ... } }
  if (typeof patch.endpointId === "string" && patch.patch && typeof patch.patch === "object") {
    var targetId = patch.endpointId
    var targetBase = resultEndpoints[targetId] || normalizeEndpoint({}, null, targetId, targetId)
    var targetMerged = {}
    for (var tk = 0; tk < ENDPOINT_KEYS.length; tk++) {
      var tKey = ENDPOINT_KEYS[tk]
      targetMerged[tKey] = Object.prototype.hasOwnProperty.call(patch.patch, tKey) ? patch.patch[tKey] : targetBase[tKey]
    }
    resultEndpoints[targetId] = normalizeEndpoint(targetMerged, null, targetId, targetMerged.name)
  }

  // Handle legacy direct property patch applied to active endpoint
  var hasDirectEndpointKeys = false
  var directPatch = {}
  for (var ek = 0; ek < ENDPOINT_KEYS.length; ek++) {
    var epKey = ENDPOINT_KEYS[ek]
    if (epKey !== "id" && Object.prototype.hasOwnProperty.call(patch, epKey)) {
      hasDirectEndpointKeys = true
      directPatch[epKey] = patch[epKey]
    }
  }

  if (hasDirectEndpointKeys) {
    var activeBase = resultEndpoints[activeId] || normalizeEndpoint({}, null, activeId, "Home")
    var activeMerged = {}
    for (var ak = 0; ak < ENDPOINT_KEYS.length; ak++) {
      var aKey = ENDPOINT_KEYS[ak]
      activeMerged[aKey] = Object.prototype.hasOwnProperty.call(directPatch, aKey) ? directPatch[aKey] : activeBase[aKey]
    }
    resultEndpoints[activeId] = normalizeEndpoint(activeMerged, null, activeId, activeMerged.name)
  }

  // Ensure activeId is valid among existing endpoints
  var validIds = Object.keys(resultEndpoints)
  if (validIds.length === 0) {
    var fallback = normalizeEndpoint({}, null, "default", "Home")
    resultEndpoints[fallback.id] = fallback
    activeId = fallback.id
  } else if (!resultEndpoints[activeId]) {
    activeId = validIds[0]
  }

  return {
    activeEndpointId: activeId,
    endpoints: resultEndpoints
  }
}

function serialize(config) {
  var clean = {
    activeEndpointId: config.activeEndpointId || "default",
    endpoints: {}
  }
  var endpoints = config.endpoints || {}
  for (var id in endpoints) {
    if (id === "__proto__" || id === "constructor" || id === "prototype") continue
    clean.endpoints[id] = normalizeEndpoint(endpoints[id], null, id, endpoints[id].name)
  }
  return JSON.stringify(clean, null, 2) + "\n"
}
