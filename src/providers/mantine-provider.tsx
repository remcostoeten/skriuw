"use client";

import { MantineProvider } from "@mantine/core";

type Props = {
	children: React.ReactNode;
};

/** Shared Mantine context for BlockNote (and portaled BlockNote menus). */
export function BlockNoteMantineProvider({ children }: Props) {
	return (
		<MantineProvider withCssVariables={false} getRootElement={() => undefined}>
			{children}
		</MantineProvider>
	);
}
