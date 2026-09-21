const fs = require("node:fs");
const path = require("node:path");
const {
    createRunOncePlugin,
    withAndroidManifest,
    withDangerousMod,
} = require("expo/config-plugins");

/**
 * Registers the share-to-Skriuw target (`docs/specs/mobile-app.md`, R-F8).
 *
 * Android only, for now. The activity it installs is a trampoline that writes
 * the shared text into the durable capture inbox and then opens the journal,
 * so a share made while Skriuw is not running is queued on disk before the
 * application exists. The iOS Share Extension target is not built here: it
 * needs an Xcode target and an App Group, which `file-inbox.ts` already
 * prefers when the container is present, so adding it is a change to this
 * plugin alone.
 *
 * Plain JavaScript on purpose: Expo CLI requires it at configuration time,
 * outside the Metro bundle and outside the application's TypeScript project.
 */

const SOURCE_FILE = path.join(__dirname, "android", "ShareCaptureActivity.kt");
const TEMPLATE_PACKAGE = "dev.skriuw.app";
const RELATIVE_CLASS = ".capture.ShareCaptureActivity";

function androidPackageOf(config) {
    const value = config.android && config.android.package;
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(
            "share-capture: expo.android.package must be set before the share target can be installed.",
        );
    }
    return value;
}

function withShareCaptureSource(config) {
    return withDangerousMod(config, [
        "android",
        (modConfig) => {
            const androidPackage = androidPackageOf(modConfig);
            const destination = path.join(
                modConfig.modRequest.platformProjectRoot,
                "app",
                "src",
                "main",
                "java",
                ...androidPackage.split("."),
                "capture",
                "ShareCaptureActivity.kt",
            );
            const source = fs
                .readFileSync(SOURCE_FILE, "utf8")
                .replace(`package ${TEMPLATE_PACKAGE}.capture`, `package ${androidPackage}.capture`);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, source);
            return modConfig;
        },
    ]);
}

function shareActivity(androidPackage) {
    return {
        $: {
            "android:name": `${androidPackage}${RELATIVE_CLASS}`,
            "android:label": "Capture to Skriuw",
            "android:exported": "true",
            "android:excludeFromRecents": "true",
            "android:noHistory": "true",
            "android:taskAffinity": "",
            "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
        },
        "intent-filter": [
            {
                action: [{ $: { "android:name": "android.intent.action.SEND" } }],
                category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
                data: [{ $: { "android:mimeType": "text/plain" } }],
            },
        ],
    };
}

function withShareCaptureActivity(config) {
    return withAndroidManifest(config, (modConfig) => {
        const androidPackage = androidPackageOf(modConfig);
        const application = modConfig.modResults.manifest.application;
        if (!Array.isArray(application) || application.length === 0) {
            throw new Error("share-capture: the Android manifest has no <application> to extend.");
        }
        const main = application[0];
        const activities = Array.isArray(main.activity) ? main.activity : [];
        const name = `${androidPackage}${RELATIVE_CLASS}`;
        main.activity = [
            ...activities.filter((activity) => activity.$ && activity.$["android:name"] !== name),
            shareActivity(androidPackage),
        ];
        return modConfig;
    });
}

function withShareCapture(config) {
    return withShareCaptureActivity(withShareCaptureSource(config));
}

module.exports = createRunOncePlugin(withShareCapture, "skriuw-share-capture", "1.0.0");
