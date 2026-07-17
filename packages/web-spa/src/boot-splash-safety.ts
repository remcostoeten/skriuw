import { installSplashSafetyTimeout } from "./components/boot-splash-controller";

// Imported FIRST in main.tsx (before ./router), so the safety timeout is armed
// even if evaluating the router or a provider module throws — otherwise a
// module-eval failure would leave the boot splash up forever with no recovery.
installSplashSafetyTimeout();
