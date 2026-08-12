// Loading the real Expo/React Native runtime under bun is not possible: the
// react-native entrypoint ships Flow syntax bun cannot parse, and the expo
// modules expect native globals that only exist on device. Every native-backed
// edge the suites reach is stubbed here rather than inside one test file, so
// each suite passes on its own instead of depending on another file having
// registered the mock first.
import { mock } from "bun:test";

mock.module("react-native", () => ({
	Platform: { OS: "ios" },
}));

mock.module("expo-crypto", () => ({
	randomUUID: () => "00000000-0000-4000-8000-000000000000",
}));

mock.module("./src/lib/config", () => ({
	getApiBaseUrl: () => "https://api.test",
}));

mock.module("./src/auth/auth-client", () => ({
	getSessionCookie: () => "better-auth.session_token=abc",
}));
