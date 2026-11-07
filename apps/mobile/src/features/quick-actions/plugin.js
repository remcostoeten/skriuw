const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  withStringsXml,
} = require("expo/config-plugins");
const ACTIONS = require("./actions.json");

// Plain JavaScript because Expo CLI requires it at configuration time, outside Metro and the TypeScript project.
const SHORTCUTS_RESOURCE = "skriuw_quick_actions";
const ICON_BACKGROUND = "#FF0B0B0D";
const ICON_FOREGROUND = "#FFFFFFFF";

// Material Design icon paths (Apache 2.0) on a 24-unit grid.
const ICON_PATHS = {
  add: "M19,13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  edit: "M3,17.25V21h3.75L17.81,9.94l-3.75,-3.75L3,17.25zM20.71,7.04c0.39,-0.39 0.39,-1.02 0,-1.41l-2.34,-2.34c-0.39,-0.39 -1.02,-0.39 -1.41,0l-1.83,1.83 3.75,3.75 1.83,-1.83z",
  search:
    "M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z",
};

function resourceName(value) {
  return value.replace(/-/g, "_");
}

function labelResource(action, kind) {
  return `skriuw_quick_action_${resourceName(action.type)}_${kind}`;
}

function iconResource(action) {
  return `skriuw_quick_action_${action.androidIcon}`;
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `quick-actions: expo.${field} must be set before quick actions can be installed.`,
    );
  }
  return value;
}

function withIosQuickActions(config) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationShortcutItems = ACTIONS.map((action) => ({
      UIApplicationShortcutItemType: action.type,
      UIApplicationShortcutItemTitle: action.title,
      UIApplicationShortcutItemIconSymbolName: action.iosSymbol,
    }));
    return modConfig;
  });
}

function vectorIcon(pathData) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    android:width="48dp"',
    '    android:height="48dp"',
    '    android:viewportWidth="48"',
    '    android:viewportHeight="48">',
    `  <path android:fillColor="${ICON_BACKGROUND}" android:pathData="M24,0A24,24 0,1 1,24,48A24,24 0,1 1,24,0Z" />`,
    '  <group android:translateX="12" android:translateY="12">',
    `    <path android:fillColor="${ICON_FOREGROUND}" android:pathData="${pathData}" />`,
    "  </group>",
    "</vector>",
    "",
  ].join("\n");
}

function shortcutsXml(androidPackage, scheme) {
  const shortcuts = ACTIONS.map((action) =>
    [
      "  <shortcut",
      `      android:shortcutId="${action.type}"`,
      '      android:enabled="true"',
      `      android:icon="@drawable/${iconResource(action)}"`,
      `      android:shortcutShortLabel="@string/${labelResource(action, "short")}"`,
      `      android:shortcutLongLabel="@string/${labelResource(action, "long")}">`,
      "    <intent",
      '        android:action="android.intent.action.VIEW"',
      `        android:targetPackage="${androidPackage}"`,
      `        android:targetClass="${androidPackage}.MainActivity"`,
      `        android:data="${scheme}://quick-action/${action.type}" />`,
      "  </shortcut>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">',
    ...shortcuts,
    "</shortcuts>",
    "",
  ].join("\n");
}

function withAndroidQuickActionResources(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const androidPackage = requiredString(
        modConfig.android && modConfig.android.package,
        "android.package",
      );
      const scheme = requiredString(
        Array.isArray(modConfig.scheme) ? modConfig.scheme[0] : modConfig.scheme,
        "scheme",
      );
      const resources = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      fs.mkdirSync(path.join(resources, "xml"), { recursive: true });
      fs.mkdirSync(path.join(resources, "drawable"), { recursive: true });
      fs.writeFileSync(
        path.join(resources, "xml", `${SHORTCUTS_RESOURCE}.xml`),
        shortcutsXml(androidPackage, scheme),
      );
      for (const action of ACTIONS) {
        const pathData = ICON_PATHS[action.androidIcon];
        if (pathData === undefined) {
          throw new Error(`quick-actions: no Android icon named ${action.androidIcon}.`);
        }
        fs.writeFileSync(
          path.join(resources, "drawable", `${iconResource(action)}.xml`),
          vectorIcon(pathData),
        );
      }
      return modConfig;
    },
  ]);
}

function withAndroidQuickActionLabels(config) {
  return withStringsXml(config, (modConfig) => {
    const items = ACTIONS.flatMap((action) => [
      AndroidConfig.Resources.buildResourceItem({
        name: labelResource(action, "short"),
        value: action.shortTitle,
        translatable: false,
      }),
      AndroidConfig.Resources.buildResourceItem({
        name: labelResource(action, "long"),
        value: action.title,
        translatable: false,
      }),
    ]);
    modConfig.modResults = AndroidConfig.Strings.setStringItem(items, modConfig.modResults);
    return modConfig;
  });
}

function withAndroidQuickActionManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    const metaData = Array.isArray(activity["meta-data"]) ? activity["meta-data"] : [];
    activity["meta-data"] = [
      ...metaData.filter((item) => item.$ && item.$["android:name"] !== "android.app.shortcuts"),
      {
        $: {
          "android:name": "android.app.shortcuts",
          "android:resource": `@xml/${SHORTCUTS_RESOURCE}`,
        },
      },
    ];
    return modConfig;
  });
}

function withQuickActions(config) {
  return withAndroidQuickActionManifest(
    withAndroidQuickActionLabels(withAndroidQuickActionResources(withIosQuickActions(config))),
  );
}

module.exports = createRunOncePlugin(withQuickActions, "skriuw-quick-actions", "1.0.0");
