#!/usr/bin/env bun
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const LOG_DIR = join(process.cwd(), 'logs', 'dev-cli')

interface Options {
	user?: string
	'dry-run'?: boolean
	output?: string
	'log-file'?: string
	snapshot?: boolean
	tables?: string
	verbose?: boolean
	'auth-tokens'?: string
	browser?: string
	port?: string
	'figma-url'?: string
	'figma-token'?: string
}

function parseArguments(): { options: Options; action: string } {
	const args = process.argv.slice(2)
	const options: Options = {}
	let action = ''

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]

		switch (arg) {
			case '-u':
			case '--user':
				options.user = args[++i]
				break
			case '-d':
			case '--dry-run':
				options['dry-run'] = true
				break
			case '-o':
			case '--output':
				options.output = args[++i]
				break
			case '-l':
			case '--log-file':
				options['log-file'] = args[++i]
				break
			case '-s':
			case '--snapshot':
				options.snapshot = true
				break
			case '-t':
			case '--tables':
				options.tables = args[++i]
				break
			case '-v':
			case '--verbose':
				options.verbose = true
				break
			case '--auth-tokens':
				options['auth-tokens'] = args[++i]
				break
			case '-b':
			case '--browser':
				options.browser = args[++i]
				break
			case '-p':
			case '--port':
				options.port = args[++i]
				break
			case '--figma-url':
				options['figma-url'] = args[++i]
				break
			case '--figma-token':
				options['figma-token'] = args[++i]
				break
			default:
				if (!arg.startsWith('-')) {
					action = arg
				}
		}
	}

	return { options, action }
}

async function main() {
	const { options, action } = parseArguments()

	if (action === 'auth') {
		await handleAuthExtraction(options)
	} else if (action === 'figma-import') {
		await handleFigmaImport(options)
	} else if (action) {
		await handleAction(action, options)
	} else {
		printUsage()
	}
}

async function handleFigmaImport(options: Options) {
	const { 'figma-url': figmaUrl, 'figma-token': figmaToken } = options

	if (!figmaUrl || !figmaToken) {
		logMessage('Figma URL and token are required for figma-import', 'error')
		console.log(
			'Usage: bun run scripts/dev-cli.ts figma-import --figma-url <url> --figma-token <token>'
		)
		process.exit(1)
	}

	logMessage(`Importing from Figma URL: ${figmaUrl}`, 'info')

	try {
		const fileId = figmaUrl.match(/file\/([^\/]+)/)?.[1]
		if (!fileId) {
			logMessage('Invalid Figma URL. Could not extract file ID.', 'error')
			process.exit(1)
		}

		const figmaApiUrl = `https://api.figma.com/v1/files/${fileId}`
		const response = await fetch(figmaApiUrl, {
			headers: {
				'X-Figma-Token': figmaToken
			}
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(
				`Figma API request failed with status ${response.status}: ${errorText}`
			)
		}

		const figmaData = await response.json()

		// For now, just log the document name.
		// The "mcp" part can be implemented here.
		logMessage(`Successfully fetched Figma file: ${figmaData.name}`, 'success')
		console.log(JSON.stringify(figmaData, null, 2))
	} catch (error) {
		logMessage(
			`Error during Figma import: ${error instanceof Error ? error.message : String(error)}`,
			'error'
		)
		process.exit(1)
	}
}

async function handleAction(action: string, options: Options) {
	const {
		user,
		'dry-run': dryRun,
		output,
		'log-file': logFile,
		snapshot,
		tables,
		verbose,
		'auth-tokens': authTokens
	} = options

	// Validate action to prevent command injection
	if (!/^[a-zA-Z0-9-]+$/.test(action)) {
		throw new Error(`Invalid action: ${action}. Must contain only alphanumeric characters and dashes.`)
	}

	logMessage(`Starting action: ${action}`, 'info')
	logMessage(`Dry run: ${dryRun}`, dryRun ? 'warn' : 'info')
	logMessage(`Target user: ${user || 'current session'}`, 'info')
	logMessage(`Snapshot: ${snapshot}`, 'info')

	let preSnapshot: any = null
	let postSnapshot: any = null

	if (snapshot && !dryRun) {
		preSnapshot = await captureSnapshot(
			tables?.split(',') || [
				'notes',
				'folders',
				'tasks',
				'settings',
				'shortcuts'
			]
		)
	}

	if (authTokens) {
		logMessage('Using provided auth tokens', 'info')
	} else {
		logMessage(
			'No auth tokens provided, using development mode bypass',
			'info'
		)
	}

	const url = `http://localhost:3000/api/dev`
	const body = JSON.stringify({ action, dryRun, userId: user })

	logMessage(`Sending request to: ${url}`, verbose ? 'info' : undefined)

	try {
		const startTime = Date.now()

		let response: string
		if (dryRun) {
			response = await dryRunAction(
				action,
				tables || 'notes,folders,tasks,settings,shortcuts'
			)
		} else {
			const curlCmd = buildCurlCommand(url, body)
			logMessage(`Executing: ${curlCmd}`, verbose ? 'info' : undefined)
			response = execSync(curlCmd, { encoding: 'utf-8' })
		}

		const endTime = Date.now()
		const duration = endTime - startTime

		logMessage(`Response received in ${duration}ms`, 'info')

		if (snapshot && !dryRun) {
			postSnapshot = await captureSnapshot(
				tables?.split(',') || [
					'notes',
					'folders',
					'tasks',
					'settings',
					'shortcuts'
				]
			)
		}

		const result = {
			timestamp: new Date().toISOString(),
			action,
			dryRun,
			targetUser: user || 'current',
			duration: `${duration}ms`,
			preSnapshot,
			postSnapshot,
			response: JSON.parse(response),
			differences:
				snapshot && preSnapshot && postSnapshot
					? calculateDifferences(preSnapshot, postSnapshot)
					: null
		}

		writeOutput(result, output || 'text', logFile)
		printSummary(result)
	} catch (error) {
		logMessage(
			`Error: ${error instanceof Error ? error.message : String(error)}`,
			'error'
		)
		process.exit(1)
	}
}

async function dryRunAction(action: string, tables: string): Promise<string> {
	const dryRunResponse = {
		success: true,
		action,
		dryRun: true,
		message: `Dry run for ${action} - no changes made`,
		preview: {}
	}

	switch (action) {
		case 'seed':
			dryRunResponse.preview = {
				notes: 'Would create sample notes (see seeds)',
				folders: 'Would create sample folders (see seeds)',
				targetTables: tables
			}
			break
		case 'clear-all':
		case 'clear-notes':
			dryRunResponse.preview = {
				warning: 'Would delete all records from specified tables',
				targetTables: tables
			}
			break
		case 'reset-database':
			dryRunResponse.preview = {
				warning: 'WOULD RESET ENTIRE DATABASE',
				targetTables: ['all'],
				critical: true
			}
			break
		default:
			dryRunResponse.preview = {
				message: `Dry run for ${action} - no destructive operations`
			}
	}

	return JSON.stringify(dryRunResponse)
}

async function captureSnapshot(tables: string[]): Promise<any> {
	const snapshot = {
		timestamp: new Date().toISOString(),
		tables: {} as Record<string, number | string>
	}

	for (const table of tables) {
		try {
			const response = execSync(`curl -s http://localhost:3000/api/dev`, {
				encoding: 'utf-8'
			})
			const data = JSON.parse(response)
			snapshot.tables[table] = data.stats[table] || 0
		} catch (error) {
			snapshot.tables[table] =
				`Error: ${error instanceof Error ? error.message : String(error)}`
		}
	}

	return snapshot
}

function calculateDifferences(pre: any, post: any): Record<string, number> {
	const differences: Record<string, number> = {}

	for (const table in pre.tables) {
		const preCount =
			typeof pre.tables[table] === 'number' ? pre.tables[table] : 0
		const postCount =
			typeof post.tables[table] === 'number' ? post.tables[table] : 0
		differences[table] = postCount - preCount
	}

	return differences
}

function buildCurlCommand(url: string, body: string): string {
	return `curl -s -X POST ${url} -H "Content-Type: application/json" -d '${body}'`
}

function writeOutput(data: any, format: string, customLogPath?: string) {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true })
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const logPath = customLogPath || join(LOG_DIR, `dev-cli-${timestamp}.log`)

	let content: string

	switch (format) {
		case 'json':
			content = JSON.stringify(data, null, 2)
			break
		case 'markdown':
			content = formatMarkdown(data)
			break
		case 'text':
		default:
			content = formatText(data)
			break
	}

	writeFileSync(logPath, content)
	logMessage(`Output written to: ${logPath}`, 'success')
}

function formatText(data: any): string {
	const output: string[] = []
	output.push('='.repeat(60))
	output.push('SKRIUW DEV CLI - EXECUTION REPORT')
	output.push('='.repeat(60))
	output.push('')
	output.push(`Timestamp: ${data.timestamp}`)
	output.push(`Action: ${data.action}`)
	output.push(`Dry Run: ${data.dryRun}`)
	output.push(`Target User: ${data.targetUser}`)
	output.push(`Duration: ${data.duration}`)
	output.push('')

	if (data.preSnapshot) {
		output.push('-'.repeat(60))
		output.push('PRE-EXECUTION SNAPSHOT')
		output.push('-'.repeat(60))
		for (const [table, count] of Object.entries(data.preSnapshot.tables)) {
			output.push(`  ${table}: ${count}`)
		}
		output.push('')
	}

	if (data.postSnapshot) {
		output.push('-'.repeat(60))
		output.push('POST-EXECUTION SNAPSHOT')
		output.push('-'.repeat(60))
		for (const [table, count] of Object.entries(data.postSnapshot.tables)) {
			output.push(`  ${table}: ${count}`)
		}
		output.push('')
	}

	if (data.differences) {
		output.push('-'.repeat(60))
		output.push('DIFFERENCES')
		output.push('-'.repeat(60))
		for (const [table, diff] of Object.entries(data.differences)) {
			const diffValue = diff as number
			const symbol = diffValue > 0 ? '+' : ''
			output.push(`  ${table}: ${symbol}${diffValue}`)
		}
		output.push('')
	}

	output.push('-'.repeat(60))
	output.push('API RESPONSE')
	output.push('-'.repeat(60))
	output.push(JSON.stringify(data.response, null, 2))
	output.push('')
	output.push('='.repeat(60))

	return output.join('\n')
}

function formatMarkdown(data: any): string {
	const output: string[] = []
	output.push('# Skriuw Dev CLI - Execution Report')
	output.push('')
	output.push(`**Timestamp:** ${data.timestamp}`)
	output.push(`**Action:** ${data.action}`)
	output.push(`**Dry Run:** ${data.dryRun}`)
	output.push(`**Target User:** ${data.targetUser}`)
	output.push(`**Duration:** ${data.duration}`)
	output.push('')

	if (data.preSnapshot) {
		output.push('## Pre-Execution Snapshot')
		output.push('')
		output.push('| Table | Count |')
		output.push('|-------|-------|')
		for (const [table, count] of Object.entries(data.preSnapshot.tables)) {
			output.push(`| ${table} | ${count} |`)
		}
		output.push('')
	}

	if (data.postSnapshot) {
		output.push('## Post-Execution Snapshot')
		output.push('')
		output.push('| Table | Count |')
		output.push('|-------|-------|')
		for (const [table, count] of Object.entries(data.postSnapshot.tables)) {
			output.push(`| ${table} | ${count} |`)
		}
		output.push('')
	}

	if (data.differences) {
		output.push('## Differences')
		output.push('')
		output.push('| Table | Change |')
		output.push('|-------|--------|')
		for (const [table, diff] of Object.entries(data.differences)) {
			const diffValue = diff as number
			const symbol = diffValue > 0 ? '+' : ''
			output.push(`| ${table} | ${symbol}${diffValue} |`)
		}
		output.push('')
	}

	output.push('## API Response')
	output.push('')
	output.push('```json')
	output.push(JSON.stringify(data.response, null, 2))
	output.push('```')
	output.push('')

	return output.join('\n')
}

function printSummary(data: any) {
	console.log('')
	console.log('='.repeat(60))
	console.log('EXECUTION SUMMARY')
	console.log('='.repeat(60))
	console.log(`Action: ${data.action}`)
	console.log(`Dry Run: ${data.dryRun}`)
	console.log(`Duration: ${data.duration}`)

	if (data.response.success !== undefined) {
		console.log(`Success: ${data.response.success}`)
	}

	if (data.differences) {
		console.log('')
		console.log('Differences:')
		for (const [table, diff] of Object.entries(data.differences)) {
			const diffValue = diff as number
			if (diffValue !== 0) {
				const symbol = diffValue > 0 ? '+' : ''
				console.log(`  ${table}: ${symbol}${diffValue}`)
			}
		}
	}

	console.log('='.repeat(60))
	console.log('')
}

function logMessage(
	message: string,
	level: 'info' | 'warn' | 'error' | 'success' = 'info'
) {
	const timestamp = new Date().toISOString()
	const levelUpper = level.toUpperCase()

	switch (level) {
		case 'error':
			console.error(`[${timestamp}] [${levelUpper}] ${message}`)
			break
		case 'warn':
			console.warn(`[${timestamp}] [${levelUpper}] ${message}`)
			break
		case 'success':
			console.log(`[${timestamp}] [SUCCESS] ${message}`)
			break
		default:
			console.log(`[${timestamp}] [${levelUpper}] ${message}`)
	}
}

async function handleAuthExtraction(options: Options) {
	const { browser = 'brave', port = '3000' } = options

	logMessage('Opening browser to extract auth tokens...', 'info')

	const browserPath = getBrowserPath(browser)
	if (!browserPath) {
		logMessage(`Browser not found: ${browser}`, 'error')
		logMessage('Available browsers: brave, chrome, firefox', 'info')
		process.exit(1)
	}

	const extractionScript = `
(function() {
	const cookies = document.cookie.split(';').reduce((acc, cookie) => {
		const [key, value] = cookie.trim().split('=');
		acc[key] = value;
		return acc;
	}, {});

	const authData = {
		cookies: cookies,
		localStorage: {
			better_auth_session: localStorage.getItem('better_auth_session'),
			better_auth_session_token: localStorage.getItem('better_auth_session_token')
		},
		sessionStorage: {
			better_auth_session: sessionStorage.getItem('better_auth_session')
		}
	};

	console.log('='.repeat(60));
	console.log('SKRIUW AUTH TOKENS');
	console.log('='.repeat(60));
	console.log(JSON.stringify(authData, null, 2));
	console.log('='.repeat(60));

	navigator.clipboard.writeText(JSON.stringify(authData)).then(() => {
		console.log('Auth tokens copied to clipboard!');
	}).catch(err => {
		console.log('Failed to copy to clipboard:', err);
	});

	return authData;
})();
`

	logMessage('', 'info')
	logMessage('INSTRUCTIONS:', 'info')
	logMessage(`1. The browser will open to localhost:${port}`, 'info')
	logMessage('2. Log in to the application', 'info')
	logMessage('3. Open DevTools (F12) and paste this script:', 'info')
	logMessage('')
	console.log(extractionScript)
	logMessage('', 'info')
	logMessage('4. The tokens will be copied to your clipboard', 'info')
	logMessage(
		'5. Run the CLI command with --auth-tokens <pasted-tokens>',
		'info'
	)
	logMessage('')

	try {
		execSync(`${browserPath} http://localhost:${port} --new-window`, {
			stdio: 'inherit'
		})
	} catch (error) {
		logMessage(
			`Failed to open browser: ${error instanceof Error ? error.message : String(error)}`,
			'error'
		)
	}
}

function getBrowserPath(browser: string): string | null {
	const browsers: Record<string, Record<string, string>> = {
		brave: {
			darwin: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
			linux: '/usr/bin/brave-browser',
			win32: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
		},
		chrome: {
			darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			linux: '/usr/bin/google-chrome',
			win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
		},
		firefox: {
			darwin: '/Applications/Firefox.app/Contents/MacOS/firefox',
			linux: '/usr/bin/firefox',
			win32: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
		}
	}

	const platform = process.platform
	const browserPaths = browsers[browser]

	if (!browserPaths) return null

	return browserPaths[platform] || null
}

function printUsage() {
	console.log(
		'Skriuw Dev CLI - Professional CLI tool for Skriuw development operations'
	)
	console.log('')
	console.log('Usage: bun run scripts/dev-cli.ts <action> [options]')
	console.log('')
	console.log('Actions:')
	console.log('  seed                    Create sample data')
	console.log('  clear-all               Delete all data')
	console.log('  clear-notes             Delete all notes')
	console.log('  clear-settings          Delete all settings')
	console.log('  clear-shortcuts         Delete all shortcuts')
	console.log('  stats                   Show database statistics')
	console.log('  ping-db                 Test database connection')
	console.log('  check-schema            Check schema synchronization')
	console.log('  push-schema             Push schema changes')
	console.log('  reset-database          Reset entire database')
	console.log('  auth                    Extract auth tokens from browser')
	console.log('  figma-import            Import component data from a Figma file')
	console.log('')
	console.log('Options:')
	console.log('  -u, --user <userId>         Target specific user ID')
	console.log(
		'  -d, --dry-run               Preview changes without executing'
	)
	console.log(
		'  -o, --output <format>       Output format (json, text, markdown)'
	)
	console.log('  -l, --log-file <path>       Custom log file path')
	console.log(
		'  -s, --snapshot              Capture pre/post database snapshots'
	)
	console.log(
		'  -t, --tables <tables>       Tables to snapshot (comma-separated)'
	)
	console.log('  -v, --verbose               Verbose output')
	console.log('  --auth-tokens <tokens>      Use pre-existing auth cookies')
	console.log(
		'  -b, --browser <browser>     Browser for auth extraction (brave, chrome, firefox)'
	)
	console.log('  -p, --port <port>           Dev server port')
	console.log('  --figma-url <url>         URL of the Figma file')
	console.log('  --figma-token <token>     Figma API token')
	console.log('')
	console.log('Examples:')
	console.log('  bun run scripts/dev-cli.ts seed --dry-run --snapshot')
	console.log(
		'  bun run scripts/dev-cli.ts clear-all --output json --snapshot'
	)
	console.log('  bun run scripts/dev-cli.ts auth --browser brave')
	console.log('  bun run scripts/dev-cli.ts stats --verbose')
	console.log('')
}

main()
