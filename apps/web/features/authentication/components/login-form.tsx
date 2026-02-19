'use client'

import { signIn, signUp } from '@/lib/auth-client'
import { Eye, EyeOff } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useCallback, useState } from 'react'

const COMMON_EMAIL_DOMAINS = [
	'gmail.com',
	'outlook.com',
	'hotmail.com',
	'yahoo.com',
	'icloud.com',
	'protonmail.com',
	'live.com',
	'live.nl',
	'hotmail.nl'
]

const GoogleIcon = () => (
	<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
		<path
			d="M8.99977 1.49977C10.7174 1.49734 12.3835 2.08694 13.7173 3.16927C13.8015 3.23748 13.8699 3.32315 13.9179 3.42035C13.9658 3.51756 13.9921 3.624 13.995 3.73235C13.9978 3.8407 13.9771 3.94838 13.9344 4.04798C13.8916 4.14757 13.8278 4.23671 13.7473 4.30927L12.6148 5.33077C12.4861 5.44661 12.3214 5.51439 12.1484 5.52259C11.9755 5.53079 11.8051 5.47892 11.666 5.37577C10.9035 4.81529 9.98359 4.5095 9.03724 4.50188C8.09089 4.49426 7.16622 4.78519 6.39472 5.33331C5.62322 5.88142 5.04417 6.65882 4.73991 7.55496C4.43564 8.4511 4.42165 9.42035 4.69992 10.3249C4.97819 11.2294 5.53456 12.0232 6.28991 12.5934C7.04526 13.1636 7.96115 13.4811 8.90732 13.5008C9.8535 13.5205 10.7818 13.2413 11.5602 12.7031C12.3387 12.1649 12.9276 11.3949 13.2433 10.5028L13.244 10.4998H10.499C10.3154 10.4996 10.1383 10.432 10.0012 10.31C9.86409 10.1879 9.77649 10.0198 9.75502 9.83752L9.74977 9.74977V8.24977C9.74977 8.05085 9.82878 7.86009 9.96944 7.71944C10.1101 7.57878 10.3009 7.49977 10.4998 7.49977H15.7085C15.8932 7.49975 16.0713 7.56785 16.2089 7.69101C16.3464 7.81418 16.4337 7.98375 16.454 8.16727C16.484 8.44252 16.4998 8.72002 16.4998 8.99977C16.4998 13.142 13.142 16.4998 8.99977 16.4998C4.85752 16.4998 1.49977 13.142 1.49977 8.99977C1.49977 4.85752 4.85752 1.49977 8.99977 1.49977Z"
			fill="currentColor"
		/>
	</svg>
)

const GithubIcon = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
	</svg>
)

const styles = {
	container: { width: '100%', maxWidth: '28rem' },
	header: { textAlign: 'center' as const, marginBottom: '1.5rem' },
	title: {
		color: 'var(--foreground)',
		fontSize: '1.5rem',
		fontWeight: 500,
		marginBottom: '0.5rem',
		letterSpacing: '-0.025em',
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	subtitle: {
		color: 'var(--muted-foreground)',
		fontSize: '0.875rem',
		fontWeight: 400,
		letterSpacing: '0.01em',
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	buttonsContainer: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.5rem',
		marginBottom: '1.5rem'
	},
	dividerContainer: { position: 'relative' as const, marginBottom: '1.5rem' },
	dividerLine: {
		position: 'absolute' as const,
		inset: 0,
		display: 'flex',
		alignItems: 'center'
	},
	dividerLineInner: { width: '100%', borderTop: '1px solid var(--border)' },
	dividerText: {
		position: 'relative' as const,
		display: 'flex',
		justifyContent: 'center',
		fontSize: '0.75rem'
	},
	dividerTextInner: {
		padding: '0 1rem',
		backgroundColor: 'transparent',
		color: 'var(--muted-foreground)',
		fontWeight: 400,
		letterSpacing: '0.01em',
		textTransform: 'uppercase' as const,
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	form: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
	inputWrapper: { position: 'relative' as const },
	input: {
		height: '44px',
		borderRadius: '8px',
		width: '100%',
		padding: '0 1rem',
		fontSize: '0.875rem',
		fontWeight: 400,
		letterSpacing: '0.01em',
		backgroundColor: 'var(--input)',
		color: 'var(--foreground)',
		borderWidth: '1px',
		borderStyle: 'solid',
		borderColor: 'var(--border)',
		outline: 'none',
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	inputWithIcon: { paddingRight: '3rem' },
	eyeButton: {
		position: 'absolute' as const,
		right: '1rem',
		top: '50%',
		transform: 'translateY(-50%)',
		background: 'none',
		border: 'none',
		cursor: 'pointer',
		color: 'var(--muted-foreground)',
		padding: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center'
	},
	submitButton: {
		height: '44px',
		borderRadius: '8px',
		width: '100%',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'var(--primary)',
		color: 'var(--primary-foreground)',
		border: 'none',
		cursor: 'pointer',
		fontSize: '1rem',
		fontWeight: 500,
		letterSpacing: '0.01em',
		overflow: 'hidden',
		position: 'relative' as const,
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	toggleButton: {
		width: '100%',
		textAlign: 'center' as const,
		backgroundColor: 'transparent',
		border: 'none',
		cursor: 'pointer',
		color: 'var(--muted-foreground)',
		fontSize: '0.875rem',
		fontWeight: 400,
		letterSpacing: '0.01em',
		padding: '0.5rem',
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	authButton: {
		height: '44px',
		borderRadius: '8px',
		width: '100%',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.5rem',
		border: 'none',
		cursor: 'pointer',
		fontSize: '0.875rem',
		fontWeight: 500,
		letterSpacing: '0.01em',
		WebkitFontSmoothing: 'antialiased' as const,
		MozOsxFontSmoothing: 'grayscale' as const
	},
	authButtonPrimary: {
		backgroundColor: 'var(--primary)',
		color: 'var(--primary-foreground)'
	},
	authButtonOutline: {
		backgroundColor: 'transparent',
		borderWidth: '1px',
		borderStyle: 'solid',
		borderColor: 'var(--border)',
		color: 'var(--foreground)'
	},
	inputError: {
		borderColor: 'var(--destructive)',
		backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, transparent)'
	},
	errorText: {
		fontSize: '0.8125rem',
		color: 'var(--destructive)',
		marginTop: '0.375rem',
		display: 'flex',
		alignItems: 'center',
		gap: '0.375rem'
	}
}

const ghostInputStyle = {
	position: 'absolute' as const,
	top: 0,
	left: 0,
	width: '100%',
	height: '100%',
	padding: '0 1rem',
	fontSize: '0.875rem',
	fontWeight: 400,
	letterSpacing: '0.01em',
	backgroundColor: 'transparent',
	color: 'var(--muted-foreground)',
	pointerEvents: 'none' as const,
	display: 'flex',
	alignItems: 'center',
	zIndex: 0,
	WebkitFontSmoothing: 'antialiased' as const,
	MozOsxFontSmoothing: 'grayscale' as const
}

type AuthButtonProps = {
	children: React.ReactNode
	onClick?: () => void
	isLoading?: boolean
	disabled?: boolean
	variant?: 'primary' | 'outline'
	type?: 'button' | 'submit'
	style?: React.CSSProperties
	icon?: React.ReactNode
}

function AuthButton({
	children,
	onClick,
	isLoading,
	disabled,
	variant = 'primary',
	type = 'button',
	style,
	icon
}: AuthButtonProps) {
	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled || isLoading}
			style={{
				...styles.authButton,
				...(variant === 'primary' ? styles.authButtonPrimary : styles.authButtonOutline),
				...(disabled || isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
				...style,
				position: 'relative',
				overflow: 'hidden'
			}}
		>
			<AnimatePresence mode="wait">
				{isLoading ? (
					<motion.div
						key="loader"
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						transition={{ duration: 0.2 }}
						style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
					>
						<motion.div
							animate={{ rotate: 360 }}
							transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
							style={{
								width: '18px',
								height: '18px',
								borderRadius: '50%',
								border: '2px solid transparent',
								borderTopColor: 'currentColor',
								borderRightColor: 'currentColor'
							}}
						/>
					</motion.div>
				) : (
					<motion.div
						key="content"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
						transition={{ duration: 0.2 }}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '0.5rem'
						}}
					>
						{icon}
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</button>
	)
}

type Props = {
	title?: string
	subtitle?: string
	onSuccess?: () => void
}

export function LoginForm({
	title = 'Welcome to Skriuw',
	subtitle = 'Sign in to sync your notes across devices',
	onSuccess
}: Props) {
	const [email, setEmail] = useState('')
	const [emailSuggestion, setEmailSuggestion] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [name, setName] = useState('')
	const [isRegisterMode, setIsRegisterMode] = useState(false)
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [loadingAction, setLoadingAction] = useState<string | null>(null)
	const [error, setError] = useState('')

	const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		setEmail(value)

		if (!value.includes('@')) {
			setEmailSuggestion('')
			return
		}

		const [localPart, domainPart] = value.split('@')
		if (domainPart === undefined) {
			setEmailSuggestion('')
			return
		}

		const match = COMMON_EMAIL_DOMAINS.find((d) => d.startsWith(domainPart))
		if (match && match !== domainPart) {
			setEmailSuggestion(localPart + '@' + match)
		} else {
			setEmailSuggestion('')
		}
	}

	const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Tab' && emailSuggestion) {
			e.preventDefault()
			setEmail(emailSuggestion)
			setEmailSuggestion('')
		}
	}

	const handleGithubSignIn = useCallback(async () => {
		setIsLoading(true)
		setLoadingAction('github')
		setError('')
		try {
			await signIn.social({ provider: 'github' })
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setError(msg || 'Failed to sign in with GitHub. Please try again.')
			setIsLoading(false)
			setLoadingAction(null)
		}
	}, [])

	const handleGoogleSignIn = useCallback(async () => {
		setIsLoading(true)
		setLoadingAction('google')
		setError('')
		try {
			await signIn.social({ provider: 'google' })
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setError(msg || 'Failed to sign in with Google. Please try again.')
			setIsLoading(false)
			setLoadingAction(null)
		}
	}, [])

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault()
			setIsLoading(true)
			setLoadingAction('email')
			setError('')

			try {
				if (isRegisterMode) {
					if (password !== confirmPassword) {
						setError('Passwords do not match')
						setIsLoading(false)
						setLoadingAction(null)
						return
					}
					await signUp.email(
						{
							email,
							password,
							name: name || email.split('@')[0] || 'User'
						},
						{
							onSuccess: () => onSuccess?.(),
							onError: (ctx: any) => {
								setError(ctx.error.message)
							}
						}
					)
				} else {
					await signIn.email(
						{ email, password },
						{
							onSuccess: () => onSuccess?.(),
							onError: (ctx: any) => {
								setError(
									ctx.error.status === 401 || ctx.error.status === 403
										? 'Invalid email or password'
										: ctx.error.message
								)
							}
						}
					)
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'An unexpected error occurred')
			} finally {
				setIsLoading(false)
				setLoadingAction(null)
			}
		},
		[email, password, confirmPassword, name, isRegisterMode, onSuccess]
	)

	const authProviders = [
		{
			id: 'github',
			label: 'Continue with GitHub',
			icon: <GithubIcon />,
			variant: 'primary' as const,
			action: handleGithubSignIn
		},
		{
			id: 'google',
			label: 'Continue with Google',
			icon: <GoogleIcon />,
			variant: 'outline' as const,
			action: handleGoogleSignIn
		}
	]

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<h1 style={styles.title}>{isRegisterMode ? 'Create an account' : title}</h1>
				<p style={styles.subtitle}>
					{isRegisterMode ? 'Enter your details to get started' : subtitle}
				</p>
			</div>

			<div style={styles.buttonsContainer}>
				{authProviders.map((provider) => (
					<AuthButton
						key={provider.id}
						onClick={provider.action}
						isLoading={loadingAction === provider.id}
						disabled={isLoading && loadingAction !== provider.id}
						variant={provider.variant}
						icon={provider.icon}
					>
						{provider.label}
					</AuthButton>
				))}
			</div>

			<div style={styles.dividerContainer}>
				<div style={styles.dividerLine}>
					<div style={styles.dividerLineInner} />
				</div>
				<div style={styles.dividerText}>
					<span style={styles.dividerTextInner}>Or continue with email</span>
				</div>
			</div>

			<form onSubmit={handleSubmit} style={styles.form}>
				{/* Email field with ghost autocomplete */}
				<div style={styles.inputWrapper}>
					{emailSuggestion && emailSuggestion.startsWith(email) && (
						<div style={ghostInputStyle} aria-hidden="true">
							<span style={{ opacity: 0 }}>{email}</span>
							<span style={{ opacity: 0.5 }}>{emailSuggestion.slice(email.length)}</span>
						</div>
					)}
					<input
						type="email"
						placeholder="Email address"
						value={email}
						onChange={handleEmailChange}
						onKeyDown={handleEmailKeyDown}
						required
						autoComplete="email"
						style={{
							...styles.input,
							position: 'relative',
							zIndex: 1,
							background: 'transparent'
						}}
					/>
				</div>

				{/* Register name field */}
				<AnimatePresence initial={false}>
					{isRegisterMode && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: 'auto', opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
							style={{ overflow: 'hidden' }}
						>
							<input
								type="text"
								placeholder="Full name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoComplete="name"
								style={styles.input}
							/>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Password */}
				<div>
					<div style={styles.inputWrapper}>
						<input
							type={showPassword ? 'text' : 'password'}
							placeholder="Password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
							style={{
								...styles.input,
								...styles.inputWithIcon,
								background: 'transparent'
							}}
						/>
						<button
							type="button"
							onClick={() => setShowPassword(!showPassword)}
							style={styles.eyeButton}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							aria-pressed={showPassword}
						>
							<AnimatePresence mode="wait">
								{showPassword ? (
									<motion.div
										key="eye-off"
										initial={{ opacity: 0, scale: 0.8 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.8 }}
										transition={{ duration: 0.15 }}
									>
										<EyeOff size={18} />
									</motion.div>
								) : (
									<motion.div
										key="eye"
										initial={{ opacity: 0, scale: 0.8 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.8 }}
										transition={{ duration: 0.15 }}
									>
										<Eye size={18} />
									</motion.div>
								)}
							</AnimatePresence>
						</button>
					</div>

					{/* Error message */}
					<AnimatePresence>
						{error && (
							<motion.p
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -4 }}
								transition={{ duration: 0.2 }}
								style={styles.errorText}
							>
								{error}
							</motion.p>
						)}
					</AnimatePresence>
				</div>

				{/* Confirm password - register only */}
				<AnimatePresence initial={false}>
					{isRegisterMode && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: 'auto', opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
							style={{ overflow: 'hidden' }}
						>
							<div style={styles.inputWrapper}>
								<input
									type={showConfirmPassword ? 'text' : 'password'}
									placeholder="Confirm password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									required
									autoComplete="new-password"
									style={{
										...styles.input,
										...styles.inputWithIcon,
										background: 'transparent'
									}}
								/>
								<button
									type="button"
									onClick={() => setShowConfirmPassword(!showConfirmPassword)}
									style={styles.eyeButton}
									aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
									aria-pressed={showConfirmPassword}
								>
									<AnimatePresence mode="wait">
										{showConfirmPassword ? (
											<motion.div
												key="eye-off-confirm"
												initial={{ opacity: 0, scale: 0.8 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={{ opacity: 0, scale: 0.8 }}
												transition={{ duration: 0.15 }}
											>
												<EyeOff size={18} />
											</motion.div>
										) : (
											<motion.div
												key="eye-confirm"
												initial={{ opacity: 0, scale: 0.8 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={{ opacity: 0, scale: 0.8 }}
												transition={{ duration: 0.15 }}
											>
												<Eye size={18} />
											</motion.div>
										)}
									</AnimatePresence>
								</button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<AuthButton
					type="submit"
					isLoading={loadingAction === 'email'}
					disabled={isLoading && loadingAction !== 'email'}
					style={styles.submitButton}
				>
					{isRegisterMode ? 'Create account' : 'Sign in'}
				</AuthButton>

				<button
					type="button"
					onClick={() => {
						setIsRegisterMode(!isRegisterMode)
						setError('')
						setEmailSuggestion('')
					}}
					style={styles.toggleButton}
				>
					{isRegisterMode
						? 'Already have an account? Sign in'
						: "Don't have an account? Register"}
				</button>
			</form>

			<p
				style={{
					marginTop: '1.5rem',
					fontSize: '0.75rem',
					color: 'var(--muted-foreground)',
					textAlign: 'center',
					lineHeight: '1.5'
				}}
			>
				By signing in you agree to our{' '}
				<a
					href="#"
					style={{ textDecoration: 'underline', color: 'var(--foreground)' }}
				>
					Terms of service
				</a>{' '}
				&amp;{' '}
				<a
					href="#"
					style={{ textDecoration: 'underline', color: 'var(--foreground)' }}
				>
					Privacy policy
				</a>
			</p>
		</div>
	)
}

export default LoginForm
