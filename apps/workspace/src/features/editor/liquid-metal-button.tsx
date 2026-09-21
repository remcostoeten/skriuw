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

const REST_SPEED = 0.6;
const HOVER_SPEED = 1;
const PRESS_SPEED = 2.4;

function scatterParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
    left: 8 + Math.random() * 84,
    edge: index % 2 === 0 ? "top" : "bottom",
    delay: Math.random() * 4,
    duration: 2.6 + Math.random() * 1.6,
    size: Math.random() < 0.35 ? 3 : 2,
  }));
}

export function LiquidMetalButton({ label, children, tabIndex, onRef, onPress, onFocus }: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [particles] = useState(scatterParticles);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shaderHostRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<ShaderMount | null>(null);
  const rippleId = useRef(0);

  useEffect(() => {
    const host = shaderHostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let mount: ShaderMount | null = null;
    try {
      mount = new ShaderMount(
        host,
        liquidMetalFragmentShader,
        {
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
        },
        undefined,
        REST_SPEED,
      );
    } catch (error) {
      console.error("liquid metal shader unavailable", error);
    }
    shaderRef.current = mount;

    return () => {
      mount?.dispose();
      shaderRef.current = null;
    };
  }, []);

  function press(event: MouseEvent<HTMLButtonElement>): void {
    const shader = shaderRef.current;
    if (shader) {
      shader.setSpeed(PRESS_SPEED);
      window.setTimeout(() => {
        shaderRef.current?.setSpeed(hovered ? HOVER_SPEED : REST_SPEED);
      }, 300);
    }

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
    <span className="liquid-metal" data-pressed={pressed ? "true" : undefined}>
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
              animationDelay: `${particle.delay}s`,
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
        onFocus={onFocus}
        onMouseEnter={() => {
          setHovered(true);
          shaderRef.current?.setSpeed(HOVER_SPEED);
        }}
        onMouseLeave={() => {
          setHovered(false);
          setPressed(false);
          shaderRef.current?.setSpeed(REST_SPEED);
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
