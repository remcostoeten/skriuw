import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
  tabIndex: number;
  onRef: (element: HTMLButtonElement | null) => void;
  onPress: () => void;
  onFocus: () => void;
};

type Ripple = { x: number; y: number; id: number };

type Particle = {
  left: number;
  edge: "top" | "bottom";
  delay: number;
  duration: number;
  size: number;
};

const PARTICLE_COUNT = 6;

const HOVER_SPEED = 1;
const PRESS_SPEED = 2.4;

const LIQUID_METAL_UNIFORMS = {
  u_colorBack: [0.08, 0.02, 0.18, 1],
  u_colorTint: [0.78, 0.62, 1, 1],
  u_isImage: false,
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.15,
  u_shiftBlue: 0.5,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_scale: 8,
  u_shape: 1,
  u_offsetX: 0.1,
  u_offsetY: -0.1,
};

function scatterParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
    left: 8 + Math.random() * 84,
    edge: index % 2 === 0 ? "top" : "bottom",
    delay: Math.random() * 4,
    duration: 2.6 + Math.random() * 1.6,
    size: Math.random() < 0.35 ? 3 : 2,
  }));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function mountShader(host: HTMLElement): ShaderMount | null {
  try {
    return new ShaderMount(host, liquidMetalFragmentShader, LIQUID_METAL_UNIFORMS, undefined, 0);
  } catch (error) {
    console.error("liquid metal shader unavailable", error);
    return null;
  }
}

function disposeShader(mount: ShaderMount): void {
  const gl = mount.canvasElement.getContext("webgl2");
  mount.dispose();
  // ShaderMount.dispose leaves the context alive, and browsers cap live WebGL contexts.
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
}

export function LiquidMetalButton({ label, children, tabIndex, onRef, onPress, onFocus }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [boosted, setBoosted] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [particles] = useState(scatterParticles);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shaderHostRef = useRef<HTMLSpanElement>(null);
  const shaderRef = useRef<ShaderMount | null>(null);
  const rippleId = useRef(0);
  const active = hovered || focused || pressed || boosted;

  useEffect(() => {
    return () => {
      if (shaderRef.current) disposeShader(shaderRef.current);
      shaderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      shaderRef.current?.setSpeed(0);
      return;
    }
    const host = shaderHostRef.current;
    if (!shaderRef.current && host && !prefersReducedMotion()) {
      shaderRef.current = mountShader(host);
    }
    shaderRef.current?.setSpeed(pressed || boosted ? PRESS_SPEED : HOVER_SPEED);
  }, [active, pressed, boosted]);

  function press(event: MouseEvent<HTMLButtonElement>): void {
    setBoosted(true);
    window.setTimeout(() => setBoosted(false), 300);

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const ripple = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        id: rippleId.current++,
      };
      setRipples((current) => [...current, ripple]);
      window.setTimeout(() => {
        setRipples((current) => current.filter((entry) => entry.id !== ripple.id));
      }, 600);
    }

    onPress();
  }

  return (
    <span
      className="liquid-metal"
      data-pressed={pressed ? "true" : undefined}
      data-active={active ? "true" : undefined}
    >
      <span className="liquid-metal-glow" aria-hidden="true" />
      <span className="liquid-metal-particles" aria-hidden="true">
        {particles.map((particle, index) => (
          <span
            key={index}
            className="liquid-metal-particle"
            data-edge={particle.edge}
            style={{
              left: `${particle.left}%`,
              width: particle.size,
              height: particle.size,
              animationDelay: `-${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
            }}
          />
        ))}
      </span>
      <span className="liquid-metal-shell" aria-hidden="true">
        <span ref={shaderHostRef} className="liquid-metal-shader" />
        <span className="liquid-metal-core" />
      </span>
      <button
        ref={(element) => {
          buttonRef.current = element;
          onRef(element);
        }}
        type="button"
        title={label}
        aria-label={label}
        tabIndex={tabIndex}
        className="liquid-metal-hit"
        data-hovered={hovered ? "true" : undefined}
        onFocus={() => {
          setFocused(true);
          onFocus();
        }}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          setPressed(true);
        }}
        onMouseUp={() => setPressed(false)}
        onClick={press}
      >
        <span className="liquid-metal-label">{children}</span>
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="liquid-metal-ripple"
            style={{ left: ripple.x, top: ripple.y }}
          />
        ))}
      </button>
    </span>
  );
}
