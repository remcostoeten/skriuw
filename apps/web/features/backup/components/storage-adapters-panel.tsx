'use client'

import { initiateOAuth2Flow, validateOAuth2State } from "../core/oauth2";
import type { StorageConnectorType } from "../core/types";
import { useStorageConnectors } from "../hooks/use-storage-connectors";
import { cn } from "@skriuw/shared";
import { Button } from "@skriuw/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@skriuw/ui/card";
import { Input } from "@skriuw/ui/input";
import { Label } from "@skriuw/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@skriuw/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Cloud, HardDrive, PlugZap, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState, useRef, useCallback, type ComponentType } from "react";

type FormState = Record<StorageConnectorType, Record<string, string>>
type NameState = Record<StorageConnectorType, string>
type FeedbackState = Record<
	StorageConnectorType,
	{ type: 'error' | 'success'; message: string } | null
>

const connectorIcons: Record<StorageConnectorType, ComponentType<{ className?: string }>> = {
	s3: Cloud,
	dropbox: PlugZap,
	'google-drive': HardDrive
}

const inputClass =
	'bg-background/50 border-border/70 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary/70 text-sm'

function connectionDot(status?: string) {
	const isConnected = status === 'connected'
	const isError = status === 'error'

	return (
		<span className='relative inline-flex h-3 w-3'>
			{isConnected && (
				<span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75' />
			)}
			<span
				className={cn(
					'relative inline-flex h-3 w-3 rounded-full',
					isConnected ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-muted-foreground/40'
				)}
			/>
		</span>
	)
}

type StorageAdaptersPanelProps = {
	activeType?: StorageConnectorType
	onTypeChange?: (type: StorageConnectorType) => void
	showHeader?: boolean
	showTabs?: boolean
	direction?: number
}

const snappyEase: [number, number, number, number] = [0.34, 1.56, 0.64, 1]
const smoothEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

const contentVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 50,
		scale: 0.96
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.35,
			ease: snappyEase,
			delay: 0.08
		}
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -40,
		scale: 0.98,
		transition: {
			duration: 0.2,
			ease: smoothEase
		}
	})
}

const leftContentVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 40,
		scale: 0.95
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.32,
			ease: snappyEase,
			delay: 0
		}
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -35,
		scale: 0.97,
		transition: {
			duration: 0.18,
			ease: smoothEase,
			delay: 0.06
		}
	})
}
const rightContentVariants = {
	initial: (direction: number) => ({
		opacity: 0,
		x: direction * 60,
		scale: 0.92
	}),
	animate: {
		opacity: 1,
		x: 0,
		scale: 1,
		transition: {
			duration: 0.3,
			ease: snappyEase,
			delay: 0.04 // Slight delay after left
		}
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -50,
		scale: 0.95,
		transition: {
			duration: 0.15,
			ease: smoothEase,
			delay: 0
		}
	})
}

export function StorageAdaptersPanel({
	activeType: controlledType,
	onTypeChange,
	showHeader = true,
	showTabs = true,
	direction: externalDirection = 1
}: StorageAdaptersPanelProps) {
	const {
		definitions,
		connectors,
		testConnector,
		disconnectConnector,
		removeConnector,
		testingConnector
	} = useStorageConnectors()

	const [formState, setFormState] = useState<FormState>({} as FormState)
	const [nameState, setNameState] = useState<NameState>({} as NameState)
	const [feedback, setFeedback] = useState<FeedbackState>({} as FeedbackState)

	const definitionMap = useMemo(
		() =>
			definitions.reduce<Record<StorageConnectorType, (typeof definitions)[number]>>(
				(acc, def) => {
					acc[def.type] = def
					return acc
				},
				{} as Record<StorageConnectorType, (typeof definitions)[number]>
			),
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

	// Handle OAuth2 callback from existing implementation
	useEffect(() => {
		const handleOAuth2Callback = () => {
			const hashParams = new URLSearchParams(window.location.hash.slice(1))
			const urlParams = new URLSearchParams(window.location.search)

			// Check for success in hash (from existing OAuth2 callback)
			const success = hashParams.get('success') || urlParams.get('success')
			const provider = hashParams.get('provider') || urlParams.get('provider')
			const accessToken = hashParams.get('access_token') || urlParams.get('access_token')
			const refreshToken = hashParams.get('refresh_token') || urlParams.get('refresh_token')
			const expiresIn = hashParams.get('expires_in') || urlParams.get('expires_in')
			const error = urlParams.get('error')

			if (error) {
				setFeedback((prev) => ({
					...prev,
					dropbox: {
						type: 'error',
						message: `OAuth2 error: ${error}`
					}
				}))
				return
			}

			if (success === 'true' && provider && accessToken) {
				const type = provider as StorageConnectorType
				const tokens = {
					access_token: accessToken,
					...(refreshToken && { refresh_token: refreshToken }),
					...(expiresIn && { expires_in: parseInt(expiresIn) })
				}

				// Clear URL parameters and hash
				window.history.replaceState({}, '', '/archive')

				// Test connector with OAuth2 tokens to validate and set 'connected' status
				testConnector(
					type,
					formState[type] || {},
					nameState[type] || definitionMap[type]?.label || type,
					tokens
				)
					.then(() => {
						setFeedback((prev) => ({
							...prev,
							[type]: { type: 'success', message: 'OAuth2 connection verified!' }
						}))
					})
					.catch((error) => {
						setFeedback((prev) => ({
							...prev,
							[type]: {
								type: 'error',
								message:
									error instanceof Error
										? error.message
										: 'OAuth2 validation failed'
							}
						}))
					})
			}
		}

		handleOAuth2Callback()
	}, [testConnector, nameState, formState, definitionMap])

	const handleFieldChange = useCallback(
		(type: StorageConnectorType, field: string, value: string) => {
			setFormState((prev) => ({
				...prev,
				[type]: {
					...prev[type],
					[field]: value
				}
			}))
		},
		[]
	)

	const handleNameChange = useCallback((type: StorageConnectorType, value: string) => {
		setNameState((prev) => ({
			...prev,
			[type]: value
		}))
	}, [])

	const handleConnect = useCallback(
		async (type: StorageConnectorType) => {
			const definition = definitionMap[type]
			if (!definition) return

			setFeedback((prev) => ({ ...prev, [type]: null }))

			// Get existing OAuth tokens if any (for re-validation)
			const existingConnector = connectors.find((c) => c.type === type)
			const existingTokens = existingConnector?.oauth2Tokens

			try {
				await testConnector(type, formState[type] || {}, nameState[type], existingTokens)
				setFeedback((prev) => ({
					...prev,
					[type]: { type: 'success', message: 'Connection saved and validated.' }
				}))
			} catch (error) {
				setFeedback((prev) => ({
					...prev,
					[type]: {
						type: 'error',
						message: error instanceof Error ? error.message : 'Failed to connect'
					}
				}))
			}
		},
		[definitionMap, testConnector, formState, nameState]
	)

	const handleOAuth2Connect = useCallback(async (type: StorageConnectorType) => {
		try {
			const authUrl = initiateOAuth2Flow(type)
			window.location.href = authUrl
		} catch (error) {
			setFeedback((prev) => ({
				...prev,
				[type]: {
					type: 'error',
					message: error instanceof Error ? error.message : 'Failed to start OAuth2 flow'
				}
			}))
		}
	}, [])

	function statusBadge(status: string | undefined) {
		const isConnected = status === 'connected'
		const isError = status === 'error'
		const isConfigured = status === 'configured'

		const tone = isConnected
			? 'bg-green-500/20 text-green-500 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
			: isError
				? 'bg-red-500/15 text-red-500 border-red-500/40'
				: isConfigured
					? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
					: 'bg-muted/50 text-muted-foreground border-border/60'

		const label = isConnected
			? 'Connected'
			: isError
				? 'Needs attention'
				: isConfigured
					? 'Configured'
					: 'Not connected'

		return (
			<span
				className={cn(
					'text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 font-medium transition-all',
					tone
				)}
			>
				{isConnected ? (
					<CheckCircle2 className='h-3.5 w-3.5' />
				) : isError ? (
					<AlertCircle className='h-3.5 w-3.5' />
				) : (
					<Cloud className='h-3.5 w-3.5 opacity-50' />
				)}
				{label}
			</span>
		)
	}

	const currentType = controlledType ?? internalType
	const handleTypeChange = useCallback(
		(next: string) => {
			const type = next as StorageConnectorType
			if (onTypeChange) onTypeChange(type)
			else setInternalType(type)
		},
		[onTypeChange]
	)

	// Additional memoized handlers for form inputs
	const handleFormNameChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			handleNameChange(currentType, e.target.value)
		},
		[currentType, handleNameChange]
	)

	const handleFormInputChange = useCallback(
		(field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
			handleFieldChange(currentType, field, e.target.value)
		},
		[currentType, handleFieldChange]
	)

	const handleConnectClick = useCallback(() => {
		handleConnect(currentType)
	}, [currentType, handleConnect])

	const handleOAuth2ConnectClick = useCallback(() => {
		handleOAuth2Connect(currentType)
	}, [currentType, handleOAuth2Connect])

	const handleDisconnectClick = useCallback(() => {
		disconnectConnector(currentType)
	}, [currentType, disconnectConnector])

	const handleRemoveClick = useCallback(() => {
		removeConnector(currentType)
	}, [currentType, removeConnector])

	return (
		<div className='space-y-5 w-full max-w-5xl mx-auto'>
			{showHeader && (
				<div className='space-y-3'>
					<h2 className='text-xl font-semibold'>Cloud storage adapters</h2>
					<p className='text-sm text-muted-foreground'>
						Connect a destination for automatic backups. Credentials are stored securely
						in your settings.
					</p>
					<div className='rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5'>
						<p>
							<strong>One place for credentials:</strong> Manage S3, Dropbox, or
							Google Drive without leaving the app.
						</p>
						<p>
							<strong>Validate before use:</strong> Each connector runs a quick check
							so you know it is ready for backups.
						</p>
						<p>
							<strong>You own the keys:</strong> Swap or revoke connectors anytime
							from your settings.
						</p>
					</div>
				</div>
			)}

			<Tabs value={currentType} onValueChange={handleTypeChange} className='space-y-4'>
				{showTabs && (
					<TabsList className='flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full bg-muted/40 border border-border/60 rounded-lg p-1'>
						{definitions.map((definition) => {
							const connector = connectors.find((c) => c.type === definition.type)
							const Icon = connectorIcons[definition.type]
							return (
								<TabsTrigger
									key={definition.type}
									value={definition.type}
									className='flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md flex-1 min-w-[180px]'
								>
									<span className='flex items-center gap-2 truncate'>
										{Icon ? (
											<Icon className='h-4 w-4' />
										) : (
											<Cloud className='h-4 w-4' />
										)}
										{definition.label}
									</span>
									<span
										className={cn(
											'flex items-center gap-1.5 text-xs font-medium',
											connector?.status === 'connected'
												? 'text-green-500'
												: connector?.status === 'error'
													? 'text-red-500'
													: 'text-muted-foreground/60'
										)}
									>
										{connectionDot(connector?.status)}
										<span className='hidden sm:inline'>
											{connector?.status === 'connected'
												? 'Connected'
												: connector?.status === 'error'
													? 'Error'
													: connector?.status === 'configured'
														? 'Configured'
														: 'Not connected'}
										</span>
									</span>
								</TabsTrigger>
							)
						})}
					</TabsList>
				)}

				{(() => {
					const definition = definitionMap[currentType]
					if (!definition) return null

					const Icon = connectorIcons[currentType]
					const connector = connectors.find((c) => c.type === currentType)
					const formValues = formState[currentType] || {}
					const friendlyName = nameState[currentType] || definition.label
					const isTesting = testingConnector === currentType
					const currentFeedback = feedback?.[currentType]

					return (
						<Card className='border-border/70 shadow-sm w-full overflow-hidden'>
							<CardHeader className='flex flex-row items-start justify-between gap-4'>
								<AnimatePresence mode='wait' initial={false}>
									<motion.div
										key={`left-${currentType}`}
										className='flex items-start gap-3'
										variants={leftContentVariants as any}
										initial='initial'
										animate='animate'
										exit='exit'
										custom={externalDirection}
									>
										<div className='rounded-lg bg-muted p-2 text-muted-foreground'>
											{Icon ? (
												<Icon className='h-5 w-5' />
											) : (
												<Cloud className='h-5 w-5' />
											)}
										</div>
										<div>
											<CardTitle className='flex items-center gap-2'>
												{definition.label}
											</CardTitle>
											<CardDescription>
												{definition.description}
											</CardDescription>
											{definition.docsUrl && (
												<a
													href={definition.docsUrl}
													target='_blank'
													rel='noreferrer'
													className='text-xs text-primary hover:underline'
												>
													View setup guide
												</a>
											)}
										</div>
									</motion.div>
								</AnimatePresence>
								<AnimatePresence mode='wait' initial={false}>
									<motion.div
										key={`right-${currentType}`}
										className='flex flex-col items-end gap-2'
										variants={rightContentVariants as any}
										initial='initial'
										animate='animate'
										exit='exit'
										custom={externalDirection}
									>
										{statusBadge(connector?.status)}
										{connector?.lastValidatedAt && (
											<span className='text-[11px] text-muted-foreground'>
												Last checked{' '}
												{new Date(
													connector.lastValidatedAt
												).toLocaleString()}
											</span>
										)}
									</motion.div>
								</AnimatePresence>
							</CardHeader>
							<CardContent className='space-y-6'>
								<AnimatePresence mode='wait' initial={false}>
									<motion.div
										key={`content-${currentType}`}
										className='grid gap-3'
										variants={contentVariants}
										initial='initial'
										animate='animate'
										exit='exit'
										custom={externalDirection}
									>
										<div className='rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
											<p className='font-medium text-foreground mb-1'>
												Where to find these credentials
											</p>
											{currentType === 's3' && (
												<ul className='list-disc list-inside space-y-1'>
													<li>
														Use an access key with programmatic access.
													</li>
													<li>
														Bucket name and region must match the bucket
														you will store backups in.
													</li>
													<li>
														Custom endpoint is for S3-compatible
														services (e.g., R2, MinIO).
													</li>
												</ul>
											)}
											{currentType === 'dropbox' && (
												<ul className='list-disc list-inside space-y-1'>
													<li>
														Click "Connect with Dropbox" to authorize
														Skriuw to access your Dropbox.
													</li>
													<li>
														Root path controls where backups are stored
														(e.g., /Apps/Skriuw).
													</li>
												</ul>
											)}
											{currentType === 'google-drive' && (
												<ul className='list-disc list-inside space-y-1'>
													<li>
														Click "Connect with Google Drive" to
														authorize Skriuw to access your Drive.
													</li>
													<li>
														Folder ID is optional - leave blank to use
														root folder.
													</li>
												</ul>
											)}
										</div>

										<div className='grid gap-2'>
											<Label className='text-xs text-muted-foreground'>
												Connection name
											</Label>
											<Input
												value={friendlyName}
												onChange={handleFormNameChange}
												placeholder={`${definition.label} backup`}
												className={inputClass}
											/>
										</div>

										<div className='grid gap-4 md:grid-cols-2'>
											{definition.fields.map((field) => (
												<div
													key={field.name}
													className='flex flex-col gap-2'
												>
													{field.type === 'oauth2' ? (
														<>
															<div className='flex items-center justify-between text-xs font-medium text-muted-foreground'>
																<Label className='text-muted-foreground'>
																	{field.label}
																</Label>
																{field.required && (
																	<span className='text-[11px] text-amber-600 dark:text-amber-300'>
																		Required
																	</span>
																)}
															</div>
															<Button
																onClick={handleOAuth2ConnectClick}
																variant='outline'
																className='w-full justify-start'
															>
																<PlugZap className='h-4 w-4 mr-2' />
																{field.label}
															</Button>
															{field.help && (
																<p className='text-[11px] text-muted-foreground leading-relaxed'>
																	{field.help}
																</p>
															)}
														</>
													) : (
														<>
															<div className='flex items-center justify-between text-xs font-medium text-muted-foreground'>
																<Label className='text-muted-foreground'>
																	{field.label}
																</Label>
																{field.required && (
																	<span className='text-[11px] text-amber-600 dark:text-amber-300'>
																		Required
																	</span>
																)}
															</div>
															<Input
																type={
																	field.secret
																		? 'password'
																		: 'text'
																}
																value={formValues[field.name] || ''}
																onChange={handleFormInputChange(
																	field.name
																)}
																placeholder={field.placeholder}
																className={inputClass}
															/>
															{field.help && (
																<p className='text-[11px] text-muted-foreground leading-relaxed'>
																	{field.help}
																</p>
															)}
														</>
													)}
												</div>
											))}
										</div>
									</motion.div>
								</AnimatePresence>

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

								<div className='flex flex-wrap gap-3 pt-2'>
									<Button
										onClick={handleConnectClick}
										disabled={isTesting}
										className='flex items-center gap-2'
									>
										{isTesting ? (
											<>
												<RefreshCcw className='h-4 w-4 animate-spin' />
												Checking...
											</>
										) : (
											<>
												<CheckCircle2 className='h-4 w-4' />
												Save & Test
											</>
										)}
									</Button>

									{connector?.status === 'connected' && (
										<Button variant='outline' onClick={handleDisconnectClick}>
											Disconnect
										</Button>
									)}
									{connector && (
										<Button variant='ghost' onClick={handleRemoveClick}>
											Remove
										</Button>
									)}
								</div>
							</CardContent>
						</Card>
					)
				})()}
			</Tabs>
		</div>
	)
}
