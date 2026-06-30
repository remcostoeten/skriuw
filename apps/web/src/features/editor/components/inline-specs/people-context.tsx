"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Person } from "@/domain/people/models";

type PeopleContextValue = {
	people: Person[];
	byId: Map<string, Person>;
};

const PeopleContext = createContext<PeopleContextValue>({ people: [], byId: new Map() });

type PeopleProviderProps = {
	people: Person[];
	children: ReactNode;
};

export function PeopleProvider({ people, children }: PeopleProviderProps) {
	const value = useMemo<PeopleContextValue>(
		() => ({ people, byId: new Map(people.map((person) => [person.id, person])) }),
		[people],
	);
	return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export function usePeopleContext() {
	return useContext(PeopleContext);
}
