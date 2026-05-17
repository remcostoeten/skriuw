"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PixelBlast = dynamic(() => import("@/shared/PixelBlast"), {
  ssr: false,
  loading: () => null,
});

export function AuthVisual() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => {
      setShouldRender(desktopQuery.matches && !reducedMotionQuery.matches);
    };

    sync();
    desktopQuery.addEventListener("change", sync);
    reducedMotionQuery.addEventListener("change", sync);

    return () => {
      desktopQuery.removeEventListener("change", sync);
      reducedMotionQuery.removeEventListener("change", sync);
    };
  }, []);

  if (!shouldRender) {
    return null;
  }

  return (
    <PixelBlast
      variant="circle"
      pixelSize={2}
      color="#B497CF"
      className="pixel-blast-auth-fade"
      style={{}}
      patternScale={1.5}
      patternDensity={0.6}
      enableRipples
      rippleSpeed={0.2}
      rippleThickness={0.25}
      rippleIntensityScale={0.6}
      speed={1.3}
      transparent
      edgeFade={0.2}
    />
  );
}
