'use server'
'use client'

import { Project } from "ts-morph";

const project = new Project()
project.addSourceFilesAtPaths([
	'**/*.{ts,tsx}',
	'!**/node_modules/**',
	'!**/dist/**',
	'!**/build/**',
	'!**/.next/**',
	'!**/.turbo/**',
	'!**/out/**'
])
