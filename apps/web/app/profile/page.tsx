'use client'

import {
	type ChangeEvent,
	type FormEvent,
	useEffect,
	useMemo,
	useState
} from 'react'
import { useSession } from '@/lib/auth-client'
import { Alert, AlertDescription, AlertTitle } from '@skriuw/ui/alert'
import { Button } from '@skriuw/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@skriuw/ui/card'
import { Input } from '@skriuw/ui/input'
import { Label } from '@skriuw/ui/label'
import { Separator } from '@skriuw/ui/separator'
import { Textarea } from '@skriuw/ui/textarea'
import {
	CheckSquare,
	Flame,
	NotebookPen,
	Shield,
	UserRound
	, ShieldAlert
} from 'lucide-react'
import { DeleteAccountDialog } from '../../components/profile/delete-account-dialog'

type Status = {
	type: 'success' | 'info'
	message: string
}

type FormState = {
	name: string
	email: string
	bio: string
}

const DEFAULT_FORM: FormState = {
	name: '',
	email: '',
	bio: ''
}

export default function ProfilePage() {
	const { data: session } = useSession()
	const [formValues, setFormValues] = useState<FormState>(DEFAULT_FORM)
	const [status, setStatus] = useState<Status | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [isEditing, setIsEditing] = useState(false)

	const user = session?.user

	const overviewStats = useMemo(
		() => [
			{
				label: 'Notes',
				value: '128',
				hint: '12 drafted this month',
				accent: 'text-primary',
				icon: NotebookPen
			},
			{
				label: 'Tasks',
				value: '42',
				hint: '6 due this week',
				accent: 'text-emerald-500',
				icon: CheckSquare
			},
			{
				label: 'Focus streak',
				value: '7 days',
				hint: 'We’ll track the real streak soon',
				accent: 'text-orange-500',
				icon: Flame
			}
		],
		[]
	)

	useEffect(() => {
		if (!user) return

		setFormValues((current) => ({
			...current,
			name: user.name || '',
			email: user.email || ''
		}))
	}, [user?.name, user?.email])

	const hasSession = useMemo(
		() => Boolean(user?.email || user?.name),
		[user?.email, user?.name]
	)

	const handleChange =
		(key: keyof FormState) =>
			(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
				setFormValues((current) => ({
					...current,
					[key]: event.target.value
				}))
			}

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setIsSaving(true)
		setStatus({
			type: 'info',
			message:
				'Profile updates are not connected to account APIs yet. Your edits stay on this page until syncing is available.'
		})

		setTimeout(() => {
			setIsSaving(false)
			setIsEditing(false)
		}, 300)
	}

	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

	const handleDeleteAccount = () => {
		setIsDeleteDialogOpen(true)
	}

	const onConfirmDelete = () => {
		setIsDeleteDialogOpen(false)
		setIsDeleting(true)

		setStatus({
			type: 'info',
			message:
				'Account deletion requires a connected account service. We have recorded your request and will notify you when it is available.'
		})

		setTimeout(() => setIsDeleting(false), 600)
	}

	if (!hasSession) {
		return (
			<div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">
						Profile
					</h1>
					<p className="text-muted-foreground">
						Sign in to manage your account and personal details.
					</p>
				</div>

				<Card className="border-dashed">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<UserRound className="h-4 w-4 text-muted-foreground" />
							Account controls unavailable
						</CardTitle>
						<CardDescription>
							We could not find an active session. Use the sign-in
							button in the toolbar to access your profile
							settings.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		)
	}

	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
			<div className="space-y-2">
				<p className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
					<Shield className="h-3.5 w-3.5" />
					Secure account area
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">
					Profile
				</h1>
				<p className="text-muted-foreground">
					Review how you show up in Skriuw and keep your account safe.
				</p>
			</div>

			{status && (
				<Alert
					variant={status.type === 'success' ? 'default' : 'default'}
					className="border-border"
				>
					<AlertTitle>
						{status.type === 'success'
							? 'Changes saved'
							: 'Heads up'}
					</AlertTitle>
					<AlertDescription>{status.message}</AlertDescription>
				</Alert>
			)}

			<Card className="border-dashed bg-muted/40">
				<CardHeader className="pb-4">
					<CardTitle className="text-lg">
						Workspace overview
					</CardTitle>
					<CardDescription>
						A snapshot of your notes and tasks while we connect to
						live workspace metrics.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 sm:grid-cols-3">
						{overviewStats.map((stat) => (
							<div
								key={stat.label}
								className="flex items-start justify-between rounded-lg border bg-background p-3 shadow-sm"
							>
								<div className="space-y-1">
									<p className="text-xs uppercase tracking-wide text-muted-foreground">
										{stat.label}
									</p>
									<p className="text-2xl font-semibold leading-tight">
										{stat.value}
									</p>
									<p className="text-xs text-muted-foreground">
										{stat.hint}
									</p>
								</div>
								<div
									className={`rounded-full bg-muted p-2 ${stat.accent}`}
								>
									<stat.icon className="h-4 w-4" />
								</div>
							</div>
						))}
					</div>
					<p className="mt-4 text-xs text-muted-foreground">
						Real-time stats will show here once account syncing is
						available.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-4">
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2 text-xl">
								<UserRound className="h-5 w-5 text-muted-foreground" />
								Profile details
							</CardTitle>
							<CardDescription>
								{isEditing
									? 'Update the basics we share across your notes and invitations.'
									: 'Review your profile information.'}
							</CardDescription>
						</div>
						{!isEditing && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setIsEditing(true)}
							>
								Edit
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{isEditing ? (
						<form onSubmit={handleSubmit} className="space-y-6">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="name">Display name</Label>
									<Input
										id="name"
										value={formValues.name}
										onChange={handleChange('name')}
										placeholder="How should we call you?"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="email">Email</Label>
									<Input
										id="email"
										type="email"
										value={formValues.email}
										onChange={handleChange('email')}
										placeholder="you@example.com"
										autoComplete="email"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="bio">Bio</Label>
									<span className="text-xs text-muted-foreground">
										Optional
									</span>
								</div>
								<Textarea
									id="bio"
									value={formValues.bio}
									onChange={handleChange('bio')}
									placeholder="Add a short introduction for collaborators."
									rows={4}
									className="rounded-lg border border-border/60 focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
								/>
							</div>

							<Separator />

							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="space-y-1 text-sm text-muted-foreground">
									<p>
										These updates stay local until profile
										syncing is available.
									</p>
									<p>
										We&apos;ll keep your details safe and
										let you confirm before sharing.
									</p>
								</div>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => setIsEditing(false)}
										disabled={isSaving}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										disabled={isSaving}
										className="w-full sm:w-auto"
									>
										{isSaving ? 'Saving…' : 'Save changes'}
									</Button>
								</div>
							</div>
						</form>
					) : (
						<div className="space-y-6">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label className="text-sm font-medium text-muted-foreground">
										Display name
									</Label>
									<p className="text-base">
										{formValues.name || (
											<span className="text-muted-foreground">
												Not set
											</span>
										)}
									</p>
								</div>
								<div className="space-y-2">
									<Label className="text-sm font-medium text-muted-foreground">
										Email
									</Label>
									<p className="text-base">
										{formValues.email || (
											<span className="text-muted-foreground">
												Not set
											</span>
										)}
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label className="text-sm font-medium text-muted-foreground">
									Bio
								</Label>
								<p className="text-base whitespace-pre-wrap">
									{formValues.bio || (
										<span className="text-muted-foreground">
											No bio added
										</span>
									)}
								</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="border border-destructive/40 bg-destructive/5">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-xl text-destructive">
						<ShieldAlert className="h-5 w-5" />
						Danger zone
					</CardTitle>
					<CardDescription>
						Delete your account and all related data. This action
						cannot be undone once enabled.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-sm text-muted-foreground space-y-1">
						<p>
							Removing your account will revoke access to synced
							content across Skriuw.
						</p>
						<p>
							Deletion requests are captured now and will process
							once the secure flow ships.
						</p>
					</div>
					<Button
						variant="outline"
						onClick={handleDeleteAccount}
						className="w-full sm:w-auto text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5"
						disabled={isDeleting}
					>
						{isDeleting ? 'Queuing request…' : 'Delete account'}
					</Button>
				</CardContent>
			</Card>

			<DeleteAccountDialog
				isOpen={isDeleteDialogOpen}
				onClose={() => setIsDeleteDialogOpen(false)}
				onConfirm={onConfirmDelete}
				isDeleting={isDeleting}
			/>
		</div>
	)
}
