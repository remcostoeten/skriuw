'use client';

import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from './icon';

type PanelLeftProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    rect: {},
    line: {
      initial: { x1: 9, y1: 4, x2: 9, y2: 20 },
      animate: {
        x1: 7,
        y1: 4,
        x2: 7,
        y2: 20,
        transition: { type: 'spring', damping: 18, stiffness: 200 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: PanelLeftProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.rect
        width={16}
        height={16}
        x={4}
        y={4}
        rx={2}
        ry={2}
        variants={variants.rect}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={9}
        y1={4}
        x2={9}
        y2={20}
        variants={variants.line}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function PanelLeft(props: PanelLeftProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  PanelLeft,
  PanelLeft as PanelLeftIcon,
  type PanelLeftProps,
  type PanelLeftProps as PanelLeftIconProps,
};
