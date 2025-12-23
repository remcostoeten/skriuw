'use client'

import { useMemo, useState, useTransition } from 'react'
import { Project } from '../types/projects'
import { filterProjects } from '../utilities/filter-projects'
import { sortProjects } from '../utilities/sort-projects'

type Filters = {
	status: string
	category: string
	year: string
	sort: 'desc' | 'asc'
}

type FilterResult = {
	items: Project[]
	filters: Filters
	setStatus: (value: string) => void
	setCategory: (value: string) => void
	setYear: (value: string) => void
	setSort: (value: 'desc' | 'asc') => void
	pending: boolean
}

export function useProjectFilters(projects: Project[]): FilterResult {
	const [filters, setFilters] = useState<Filters>({ status: 'all', category: 'all', year: 'all', sort: 'desc' })
	const [pending, startTransition] = useTransition()

	const items = useMemo(function compute() {
		const filtered = filterProjects(projects, filters.status, filters.category, filters.year)
		return sortProjects(filtered, filters.sort)
	}, [projects, filters])

	function setStatus(value: string) {
		startTransition(function update() {
			setFilters(function apply(current) {
				return { ...current, status: value }
			})
		})
	}

	function setCategory(value: string) {
		startTransition(function update() {
			setFilters(function apply(current) {
				return { ...current, category: value }
			})
		})
	}

	function setYear(value: string) {
		startTransition(function update() {
			setFilters(function apply(current) {
				return { ...current, year: value }
			})
		})
	}

	function setSort(value: 'desc' | 'asc') {
		startTransition(function update() {
			setFilters(function apply(current) {
				return { ...current, sort: value }
			})
		})
	}

	return { items, filters, setStatus, setCategory, setYear, setSort, pending }
}
