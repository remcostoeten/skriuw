import GhostCursor from "./ghost-cursor";

interface SkriuwEffectProps {
    className?: string;
}

export function SkriuwEffect({ className = "" }: SkriuwEffectProps) {
    return (
        <div className={`relative w-full h-full overflow-hidden bg-[hsl(225,25%,8%)] rounded-2xl ${className}`}>
            {/* Ghost cursor effect */}
            <GhostCursor
                color="#6B8AFF"
                brightness={1.5}
                edgeIntensity={0}
                trailLength={60}
                inertia={0.6}
                grainIntensity={0.04}
                bloomStrength={0.4}
                bloomRadius={1.5}
                bloomThreshold={0.015}
                fadeDelayMs={1200}
                fadeDurationMs={1800}
            />

            {/* Skriuw branding - top left */}
            <div className="absolute top-8 left-8 flex items-center gap-3 z-20">
                <div className="w-10 h-10 rounded-xl bg-[hsl(225,50%,50%)] flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                            d="M4 16L16 4M16 4H8M16 4V12"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
                <span className="text-[hsl(0,0%,90%)] text-xl font-semibold tracking-tight">
                    skriuw
                </span>
            </div>

            {/* Bottom content */}
            <div className="absolute bottom-8 left-8 right-8 z-20">
                <p className="text-[hsl(225,20%,55%)] text-sm font-medium mb-2">
                    Your creative space
                </p>
                <p className="text-[hsl(225,15%,40%)] text-xs max-w-xs leading-relaxed">
                    Write freely, organize beautifully, share effortlessly.
                </p>
            </div>
        </div>
    );
};

export default SkriuwEffect;
