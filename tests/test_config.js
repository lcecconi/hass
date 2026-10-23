#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const source = fs
  .readFileSync(path.join(__dirname, "..", "ConfigStore.js"), "utf8")
  .replace(/^\.pragma library\s*$/m, "");
const names = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
const constants = [...source.matchAll(/^var\s+([A-Z][A-Z0-9_]*)/gm)].map((m) => m[1]);
const Config = new Function(`${source}\nreturn {${[...names, ...constants].join(",")}};`)();

let failures = 0;
let checks = 0;
function eq(label, actual, expected) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.log(`  FAIL ${label}\n       got      ${JSON.stringify(actual)}` +
                `\n       expected ${JSON.stringify(expected)}`);
  }
}

console.log("configuration normalization and serialization");
const invalid = Config.parse("{broken", ["light.demo"]);
eq("invalid JSON is reported", invalid.error, "config.json is not valid JSON");
eq("invalid config keeps safe demo defaults in default endpoint",
   invalid.config.endpoints.default.demoFavorites,
   ["light.demo"]);
eq("invalid config has default activeEndpointId", invalid.config.activeEndpointId, "default");

// Legacy migration test
const legacyRaw = JSON.stringify({
  baseUrl: 7,
  demoMode: true,
  favorites: ["light.a", 4, "", "light.a"],
  demoFavorites: [],
  showEntityIcons: false,
  showPanelPinOnHover: true,
  displayNameOverrides: { "light.a": "Desk", bad: 4 },
  iconOverrides: [],
  selectedTab: "area:kitchen"
});
const parsedLegacy = Config.parse(legacyRaw, ["light.demo"]);
eq("legacy format migrates to default endpoint", parsedLegacy.config.activeEndpointId, "default");
eq("legacy typed values are normalized under default endpoint", parsedLegacy.config.endpoints.default, {
  id: "default",
  name: "Home",
  icon: "home",
  baseUrl: "",
  localUrl: "",
  trustedNetwork: "",
  demoMode: true,
  favorites: ["light.a"],
  demoFavorites: [],
  roomReadings: [],
  demoRoomReadings: [],
  pinnedRoomReadings: [],
  demoPinnedRoomReadings: [],
  panelOrder: ["light.a"],
  demoPanelOrder: [],
  groupByArea: false,
  showEntityIcons: false,
  showPanelPinOnHover: true,
  selectedTab: "area:kitchen",
  displayNameOverrides: { "light.a": "Desk" },
  iconOverrides: {}
});

// Multi-endpoint parsing test
const multiRaw = JSON.stringify({
  activeEndpointId: "cabin",
  endpoints: {
    home: {
      name: "City Flat",
      baseUrl: "https://ha.city.net",
      favorites: ["light.hallway"]
    },
    cabin: {
      name: "Mountain Cabin",
      baseUrl: "https://ha.cabin.net",
      localUrl: "https://192.168.1.10:8123",
      trustedNetwork: "Cabin_WiFi",
      favorites: ["switch.heater"]
    }
  }
});
const parsedMulti = Config.parse(multiRaw, []);
eq("multi-endpoint activeEndpointId preserved", parsedMulti.config.activeEndpointId, "cabin");
eq("home endpoint normalized", parsedMulti.config.endpoints.home.name, "City Flat");
eq("cabin endpoint normalized", parsedMulti.config.endpoints.cabin.baseUrl, "https://ha.cabin.net");
eq("activeEndpoint helper returns active endpoint", Config.activeEndpoint(parsedMulti.config).name, "Mountain Cabin");

// Merging and updating
const mergedDirect = Config.merge(parsedMulti.config, {
  groupByArea: true,
  token: "must-not-be-serialized",
  unknown: "ignored"
});
eq("direct patch applies to active endpoint", mergedDirect.endpoints.cabin.groupByArea, true);
eq("unaffected endpoint untouched", mergedDirect.endpoints.home.groupByArea, false);
eq("tokens and unknown keys dropped", mergedDirect.endpoints.cabin.token, undefined);

// Adding a new endpoint via patch
const withNewEndpoint = Config.merge(mergedDirect, {
  endpoints: {
    office: {
      name: "Work Office",
      baseUrl: "https://ha.office.net"
    }
  }
});
eq("new endpoint added", withNewEndpoint.endpoints.office.name, "Work Office");
eq("endpoint count is 3", Object.keys(withNewEndpoint.endpoints).length, 3);

// Targeted patch via endpointId
const targeted = Config.merge(withNewEndpoint, {
  endpointId: "home",
  patch: {
    favorites: ["light.living_room"]
  }
});
eq("targeted patch updates specified endpoint", targeted.endpoints.home.favorites, ["light.living_room"]);

// Serialization security & formatting
const serialized = Config.serialize(targeted);
eq("serialized ends with newline", serialized.endsWith("}\n"), true);
eq("serialized contains no token", serialized.includes("token"), false);
eq("serialized parses back cleanly", Config.parse(serialized).config.activeEndpointId, "cabin");

// Deletion of endpoint
const deleted = Config.merge(targeted, {
  endpoints: {
    office: null
  }
});
eq("endpoint was deleted", deleted.endpoints.office, undefined);
eq("remaining endpoints are home and cabin", Object.keys(deleted.endpoints).sort(), ["cabin", "home"]);

console.log();
if (failures) {
  console.log(`FAILED: ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`all ${checks} checks passed`);
