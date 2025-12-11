'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { AlertCircle, CheckCircle2, Cloud, HardDrive, PlugZap, RefreshCcw } from 'lucide-react'

import { Button } from '@skriuw/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { Input } from '@skriuw/ui/input'
import { Label } from '@skriuw/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@skriuw/ui/tabs'
import { cn } from '@skriuw/shared'

import { useStorageConnectors } from '../hooks/use-storage-connectors'
import type { StorageConnectorType } from '../core/types'

type FormState = Record<StorageConnectorType, Record<string, string>>
type NameState = Record<StorageConnectorType, string>
type FeedbackState = Record<StorageConnectorType, { type: 'error' | 'success'; message: string } | null>

const connectorIcons: Record<StorageConnectorType, ComponentType<{ className?: string }>> = {
	s3: Cloud,
	dropbox: PlugZap,
	'google-drive': HardDrive,
}

const inputClass =
	'bg-background/50 border-border/70 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary/70 text-sm'

function connectionDot(status?: string) {
	const color =
		status === 'connected'
			? 'bg-green-500/80'
			: status === 'error'
				? 'bg-amber-500/80'
				: 'bg-border'
	return <span className={cn('h-2.5 w-2.5 rounded-full inline-block', color)} />
}

type StorageAdaptersPanelProps = {
	activeType?: StorageConnectorType
	onTypeChange?: (type: StorageConnectorType) => void
	showHeader?: boolean
	showTabs?: boolean
}

export function StorageAdaptersPanel({
	activeType: controlledType,
	onTypeChange,
	showHeader = true,
	showTabs = true,
}: StorageAdaptersPanelProps) {
	const {
		definitions,
		connectors,
		testConnector,
		disconnectConnector,
		testingConnector,
	} = useStorageConnectors()

	const [formState, setFormState] = useState<FormState>({} as FormState)
	const [nameState, setNameState] = useState<NameState>({} as NameState)
	const [feedback, setFeedback] = useState<FeedbackState>({} as FeedbackState)

	const definitionMap = useMemo(
		() =>
			definitions.reduce<Record<StorageConnectorType, (typeof definitions)[number]>>((acc, def) => {
				acc[def.type] = def
				return acc
			}, {} as Record<StorageConnectorType, (typeof definitions)[number]>),
		[definitions]
	)

	const [internalType, setInternalType] = useState<StorageConnectorType>(
		controlledType ?? definitions[0]?.type ?? 's3'
	)

	useEffect(() => {
		if (controlledType) {
			setInternalType(controlledType)
		}
	}, [controlledType])

	useEffect(() => {
		if (definitions.length && !definitions.find((d) => d.type === internalType)) {
			setInternalType(definitions[0].type)
		}
	}, [internalType, definitions])

	useEffect(() => {
		const nextForm: Partial<FormState> = {}
		const nextNames: Partial<NameState> = {}

		for (const connector of connectors) {
			nextForm[connector.type] = connector.config
			nextNames[connector.type] = connector.name
		}

		setFormState((prev) => ({ ...prev, ...(nextForm as FormState) }))
		setNameState((prev) => ({ ...prev, ...(nextNames as NameState) }))
	}, [connectors])

	function handleFieldChange(type: StorageConnectorType, field: string, value: string) {
		setFormState((prev) => ({
			...prev,
			[type]: {
				...(prev[type] || {}),
				[field]: value,
			},
		}))
	}

	function handleNameChange(type: StorageConnectorType, value: string) {
		setNameState((prev) => ({
			...prev,
			[type]: value,
		}))
	}

	async function handleConnect(type: StorageConnectorType) {
		const definition = definitionMap[type]
		if (!definition) return

		setFeedback((prev) => ({ ...prev, [type]: null }))

		try {
			await testConnector(type, formState[type] || {}, nameState[type])
			setFeedback((prev) => ({
				...prev,
				[type]: { type: 'success', message: 'Connection saved and validated.' },
			}))
		} catch (error) {
			setFeedback((prev) => ({
				...prev,
				[type]: {
					type: 'error',
					message: error instanceof Error ? error.message : 'Failed to connect',
				},
			}))
		}
	}

	function statusBadge(status: string | undefined) {
		const tone =
			status === 'connected'
				? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
				: status === 'error'
					? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
					: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30'

		const label =
			status === 'connected' ? 'Connected' : status === 'error' ? 'Needs attention' : 'Not connected'

		return (
			<span
				className={cn(
					'text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1 font-medium',
					tone
				)}
			>
				{status === 'connected' ? (
					<CheckCircle2 className="h-3.5 w-3.5" />
				) : status === 'error' ? (
					<AlertCircle className="h-3.5 w-3.5" />
				) : (
					<RefreshCcw className="h-3.5 w-3.5" />
				)}
				{label}
			</span>
		)
	}

	const currentType = controlledType ?? internalType
	const handleTypeChange = (next: StorageConnectorType) => {
		if (onTypeChange) onTypeChange(next)
		else setInternalType(next)
	}

	return (
		<div className="space-y-5 w-full max-w-5xl mx-auto">
			{showHeader && (
				<div className="space-y-3">
					<h2 className="text-xl font-semibold">Cloud storage adapters</h2>
					<p className="text-sm text-muted-foreground">
						Connect a destination for automatic backups. Credentials are stored securely in your settings.
					</p>
					<div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
						<p>
							<strong>One place for credentials:</strong> Manage S3, Dropbox, or Google Drive without leaving the app.
						</p>
						<p>
							<strong>Validate before use:</strong> Each connector runs a quick check so you know it is ready for backups.
						</p>
						<p>
							<strong>You own the keys:</strong> Swap or revoke connectors anytime from your settings.
						</p>
					</div>
				</div>
			)}

			<Tabs
				value={currentType}
				onValueChange={(value) => handleTypeChange(value as StorageConnectorType)}
				className="space-y-4"
			>
				{showTabs && (
					<TabsList className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full bg-muted/40 border border-border/60 rounded-lg p-1">
						{definitions.map((definition) => {
							const connector = connectors.find((c) => c.type === definition.type)
							const Icon = connectorIcons[definition.type]
							return (
								<TabsTrigger
									key={definition.type}
									value={definition.type}
									className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md flex-1 min-w-[180px]"
								>
									<span className="flex items-center gap-2 truncate">
										{Icon ? <Icon className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
										{definition.label}
									</span>
									<span className="flex items-center gap-1 text-xs text-muted-foreground">
										{connectionDot(connector?.status)}
										<span className="hidden sm:inline">
											{connector?.status === 'connected'
												? 'Connected'
												: connector?.status === 'error'
													? 'Needs attention'
													: 'Not connected'}
										</span>
									</span>
								</TabsTrigger>
							)
						})}
					</TabsList>
				)}

				{definitions.map((definition) => {
					const Icon = connectorIcons[definition.type]
					const connector = connectors.find((c) => c.type === definition.type)
					const formValues = formState[definition.type] || {}
					const friendlyName = nameState[definition.type] || definition.label
					const isTesting = testingConnector === definition.type
					const currentFeedback = feedback?.[definition.type]

					return (
						<TabsContent key={definition.type} value={definition.type} className="w-full">
							<Card className="border-border/70 shadow-sm w-full">
								<CardHeader className="flex flex-row items-start justify-between gap-4">
									<div className="flex items-start gap-3">
										<div className="rounded-lg bg-muted p-2 text-muted-foreground">
											{Icon ? <Icon className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
										</div>
										<div>
											<CardTitle className="flex items-center gap-2">
												{definition.label}
											</CardTitle>
											<CardDescription>{definition.description}</CardDescription>
											{definition.docsUrl && (
												<a
													href={definition.docsUrl}
													target="_blank"
													rel="noreferrer"
													className="text-xs text-primary hover:underline"
												>
													View setup guide
												</a>
											)}
										</div>
									</div>
								<div className="flex flex-col items-end gap-2">
									{statusBadge(connector?.status)}
									{connector?.lastValidatedAt && (
										<span className="text-[11px] text-muted-foreground">
											Last checked {new Date(connector.lastValidatedAt).toLocaleString()}
										</span>
									)}
								</div>
								</CardHeader>
								<CardContent className="space-y-6">
									<div className="grid gap-3">
										<div className="grid gap-2">
											<Label className="text-xs text-muted-foreground">Connection name</Label>
											<Input
												value={friendlyName}
												onChange={(e) => handleNameChange(definition.type, e.target.value)}
												placeholder={`${definition.label} backup`}
												className={inputClass}
											/>
										</div>

									<div className="grid gap-4 md:grid-cols-2">
											{definition.fields.map((field) => (
												<div key={field.name} className="flex flex-col gap-2">
													<div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
														<Label className="text-muted-foreground">{field.label}</Label>
														{field.required && (
															<span className="text-[11px] text-amber-600 dark:text-amber-300">
																Required
															</span>
														)}
													</div>
													<Input
														type={field.secret ? 'password' : 'text'}
														value={formValues[field.name] || ''}
														onChange={(e) =>
															handleFieldChange(definition.type, field.name, e.target.value)
														}
														placeholder={field.placeholder}
														className={inputClass}
													/>
													{field.help && (
														<p className="text-[11px] text-muted-foreground leading-relaxed">
															{field.help}
														</p>
													)}
												</div>
											))}
										</div>
									</div>

									{currentFeedback && (
										<div
											className={cn(
												'rounded-md border px-3 py-2 text-sm',
												currentFeedback.type === 'error'
													? 'border-destructive/30 bg-destructive/10 text-destructive'
													: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
											)}
										>
											{currentFeedback.message}
										</div>
									)}

									<div className="flex flex-wrap gap-3 pt-2">
										<Button
											onClick={() => handleConnect(definition.type)}
											disabled={isTesting}
											className="flex items-center gap-2"
										>
											{isTesting ? (
												<>
													<RefreshCcw className="h-4 w-4 animate-spin" />
													Checking...
												</>
											) : (
												<>
													<CheckCircle2 className="h-4 w-4" />
													Save & Test
												</>
											)}
										</Button>

										<Button
											variant="outline"
											onClick={() => disconnectConnector(definition.type)}
											disabled={connector?.status !== 'connected'}
										>
											Disconnect
										</Button>
									</div>
								</CardContent>
							</Card>
						</TabsContent>
					)
				})}
			</Tabs>
		</div>
	)
}
