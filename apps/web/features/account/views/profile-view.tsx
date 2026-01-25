'use client'

import DangerPanel from "../components/danger-panel";
import NodePanel from "../components/node-panel";
import OAuthPanel from "../components/oauth-panel";
import ProfileSummary from "../components/profile-summary";
import { AIConfigPanel } from "@/features/ai";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@skriuw/ui/card";
import { Separator } from "@skriuw/ui/separator";
import { CalendarDays, Shield, UserRound } from "lucide-react";
import { useMemo } from "react";

function formatDate(value: Date | string | number | undefined): string {
	if (!value) return 'Unknown'
	const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value
	return date.toLocaleString()
}

type SessionData = ReturnType<typeof useSession>['data']
type SessionUser = NonNullable<SessionData>['user']

type ProfileViewProps = {
	user?: SessionUser
	isPending: boolean
	onRefresh: () => Promise<void>
}

function ProfileShell({ user, isPending, onRefresh }: ProfileViewProps) {
	const createdAt = useMemo(
		function computeCreatedAt() {
			if (!user) return 'Unknown'
			return formatDate(
				(user as { createdAt?: unknown })?.createdAt as Date | string | number | undefined
			)
		},
		[user]
	)

	if (isPending) {
		return (
			<div className='mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10'>
				<div className='space-y-2 animate-pulse'>
					<div className='h-4 w-32 rounded bg-muted' />
					<div className='h-8 w-48 rounded bg-muted' />
					<div className='h-4 w-64 rounded bg-muted' />
				</div>
				<Card className='border-dashed'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<UserRound className='h-4 w-4 text-muted-foreground' />
							Loading profile
						</CardTitle>
						<CardDescription>Preparing your account details.</CardDescription>
					</CardHeader>
				</Card>
			</div>
		)
	}

	if (!user) {
		return (
			<div className='mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10'>
				<div className='space-y-1'>
					<h1 className='text-3xl font-semibold tracking-tight'>Profile</h1>
					<p className='text-muted-foreground'>
						Sign in to manage your account and personal details.
					</p>
				</div>

				<Card className='border-dashed'>
					<CardHeader>
						<CardTitle className='flex items-center gap-2 text-lg'>
							<UserRound className='h-4 w-4 text-muted-foreground' />
							Account controls unavailable
						</CardTitle>
						<CardDescription>
							We could not find an active session. Use the sign-in button in the
							toolbar to access your profile settings.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		)
	}

	return (
		<div className='mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10'>
			<div className='space-y-2'>
				<p className='inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'>
					<Shield className='h-3.5 w-3.5' />
					Secure account area
				</p>
				<div className='flex flex-wrap items-center gap-3'>
					<h1 className='text-3xl font-semibold tracking-tight'>Profile</h1>
					<span className='flex items-center gap-1 text-sm text-muted-foreground'>
						<CalendarDays className='h-4 w-4' />
						Created {createdAt}
					</span>
				</div>
				<p className='text-muted-foreground'>
					Review how you show up in Skriuw and keep your account safe.
				</p>
			</div>

			<ProfileSummary user={user} onRefresh={onRefresh} />
			<Separator />
			<NodePanel />
			<Separator />
			<AIConfigPanel />
			<OAuthPanel userEmail={user.email as string} />
			<DangerPanel />
		</div>
	)
}

export default function ProfileView() {
	const { data: session, isPending, refetch } = useSession()

	return <ProfileShell user={session?.user} isPending={isPending} onRefresh={refetch} />
}
