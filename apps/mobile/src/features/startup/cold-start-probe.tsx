import { useEffect } from "react";
import { skriuwPlatform } from "../../../modules/skriuw-platform";
import { recordColdStart } from "./cold-start-log";

let measured = false;

export function ColdStartProbe() {
  useEffect(() => {
    // Development builds load their JavaScript from Metro, so their launches say nothing about R-P4.
    if (measured || __DEV__) {
      return;
    }
    measured = true;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const timing = skriuwPlatform.launchTiming();
        if (timing === null) {
          return;
        }
        try {
          recordColdStart({ ...timing, at: Date.now() - timing.elapsedMs });
        } catch (error) {
          console.warn("cold start was not recorded", error);
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
