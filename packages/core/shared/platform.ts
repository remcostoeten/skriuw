import { isExpo, isServer, isTauri, isWeb } from './helpers/determine-platform';

export const Platform = {
    isWeb,
    isTauri,
    isExpo,
    isServer,

    // Computed properties for convenience (though setters won't work, strictly getters are better if environment changes, but env usually doesn't change at runtime)
    get web() { return isWeb(); },
    get tauri() { return isTauri(); },
    get expo() { return isExpo(); },
    get server() { return isServer(); },
} as const;
