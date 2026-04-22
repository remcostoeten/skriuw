"use client";

import { useMemo, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { FACE_SHAPES, getAvatarData, resolveAvatarColor } from "@/shared/lib/avatar";

type AvatarFaceProps = {
  name?: string | null;
  size?: number;
  color?: string;
  className?: string;
};

export function AvatarFace({ name, size = 36, color, className }: AvatarFaceProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const data = useMemo(() => getAvatarData(name), [name]);
  const backgroundColor = useMemo(() => resolveAvatarColor(name, color), [name, color]);
  const shape = FACE_SHAPES[data.faceType];
  const [, , rawWidth, rawHeight] = shape.viewBox.split(" ").map(Number);
  const faceWidth = size * 0.6;
  const faceHeight = faceWidth / ((rawWidth ?? 1) / (rawHeight ?? 1));
  const fontSize = size * 0.24;
  const baseOffsetX = data.rotation.y * size * 0.05;
  const baseOffsetY = -data.rotation.x * size * 0.05;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / rect.width - 0.5;
    const localY = (event.clientY - rect.top) / rect.height - 0.5;
    setOffset({
      x: Math.max(-1, Math.min(1, localX * 2)) * (size * 0.045),
      y: Math.max(-1, Math.min(1, localY * 2)) * (size * 0.04),
    });
  };

  return (
    <div
      className={cn("relative overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundColor,
      }}
      onMouseMove={handleMove}
      onMouseLeave={() => setOffset({ x: 0, y: 0 })}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_62%)]" />
      <div
        className="absolute left-1/2 top-1/2 transition-transform duration-200 ease-out"
        style={{
          transform: `translate(-50%, -50%) translate(${baseOffsetX + offset.x}px, ${baseOffsetY + offset.y}px)`,
        }}
      >
        <svg
          width={faceWidth}
          height={faceHeight}
          viewBox={shape.viewBox}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {shape.paths.map((path, index) => (
            <path key={index} d={path} fill="#111111" />
          ))}
        </svg>
        <span
          className="absolute left-1/2 top-full mt-[8%] -translate-x-1/2 font-mono font-bold leading-none text-black"
          style={{ fontSize }}
        >
          {data.initial}
        </span>
      </div>
    </div>
  );
}
