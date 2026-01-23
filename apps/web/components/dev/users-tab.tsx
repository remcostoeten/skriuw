'use client'

import { SectionLabel, StatCard, ActionButton } from "./common";
import { notify } from "@/lib/notify";
import { RotateCcw, Trash2, Loader2, Users } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

type UserInfo = {
	id: string
	isAnonymous: boolean
	createdAt: string
	email?: string
	name?: string
}

type DbStats = {
	users?: number
	anonymousUsers?: number
	anonymousUsersOld?: number
}

// We accept stats as props because they might come from the global DB stats check
// But we could also fetch them locally if we wanted total isolation.
// For now, let's accept them to keep it consistent with the header stats.
export function UsersTab({ stats }: { stats?: DbStats | null }) {
	const [users, setUsers] = useState<UserInfo[]>([])
	const [usersLoading, setUsersLoading] = useState(false)
	const [userActionLoading, setUserActionLoading] = useState<string | null>(null)

	const fetchUsers = useCallback(async () => {
		setUsersLoading(true)
		try {
			const res = await fetch('/api/dev/users')
			if (res.ok) {
				const data = await res.json()
				setUsers(data.users || [])
			}
		} catch (error) {
			console.error('Failed to fetch users', error)
			notify('Failed to fetch users')
		} finally {
			setUsersLoading(false)
		}
	}, [])

	// Load users on mount
	useEffect(() => {
		fetchUsers()
	}, [fetchUsers])

	const resetUser = useCallback(
		async (userId: string) => {
			if (
				!confirm(
					'Reset this user? All their notes, folders, tasks, and settings will be deleted.'
				)
			)
				return

			setUserActionLoading(`reset-${userId}`)
			try {
				const res = await fetch(`/api/dev/users/${userId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'reset' })
				})
				const data = await res.json()
				if (!res.ok) throw new Error(data.error || 'Reset failed')
				notify(data.message)
				// We should probably trigger a global stats refresh too, but let's just refresh list for now
				fetchUsers()
			} catch (error) {
				notify(error instanceof Error ? error.message : 'Reset failed')
			} finally {
				setUserActionLoading(null)
			}
		},
		[fetchUsers]
	)

	const deleteUser = useCallback(
		async (userId: string) => {
			if (!confirm('Delete this user entirely? This action cannot be undone.')) return

			setUserActionLoading(`delete-${userId}`)
			try {
				const res = await fetch(`/api/dev/users/${userId}`, { method: 'DELETE' })
				const data = await res.json()
				if (!res.ok) throw new Error(data.error || 'Delete failed')
				notify(data.message)
				fetchUsers()
				// Parent might want to refresh stats
			} catch (error) {
				notify(error instanceof Error ? error.message : 'Delete failed')
			} finally {
				setUserActionLoading(null)
			}
		},
		[fetchUsers]
	)

	return (
		<>
			<div className='space-y-2'>
				<SectionLabel>User Statistics</SectionLabel>
				<div className='grid grid-cols-2 gap-2'>
					<StatCard label='Total Users' value={stats?.users ?? '-'} loading={false} />
					<StatCard
						label='Anonymous'
						value={stats?.anonymousUsers ?? '-'}
						loading={false}
					/>
				</div>
				{/* Pending deletion omitted if not in basic stats passed down, or we fetch it?
                    The stats prop comes from /api/dev which mimics everything.
                */}
				<StatCard
					label='Pending Deletion'
					value={stats?.anonymousUsersOld ?? '-'}
					loading={false}
				/>
			</div>

			<div className='space-y-2'>
				<SectionLabel>User Management</SectionLabel>
				<div className='bg-muted/30 border rounded-lg p-2 space-y-1 text-xs max-h-60 overflow-y-auto custom-scrollbar'>
					{usersLoading ? (
						<div className='flex items-center justify-center py-4'>
							<Loader2 className='h-4 w-4 animate-spin' />
						</div>
					) : users.length === 0 ? (
						<div className='text-muted-foreground text-center py-4'>No users found</div>
					) : (
						users.map((user) => (
							<div
								key={user.id}
								className='flex items-center justify-between p-1.5 rounded hover:bg-muted/50 group'
							>
								<div className='flex items-center gap-2 flex-1 min-w-0'>
									{user.isAnonymous ? (
										<div className='h-2 w-2 rounded-full bg-orange-500 flex-shrink-0' />
									) : (
										<div className='h-2 w-2 rounded-full bg-green-500 flex-shrink-0' />
									)}
									<div className='font-mono text-[10px] flex-shrink-0'>
										{user.id.slice(-8)}
									</div>
									{user.email && (
										<div className='text-muted-foreground truncate text-[10px]'>
											{user.email}
										</div>
									)}
								</div>
								<div className='flex items-center gap-1'>
									<div className='text-right mr-2'>
										<div className='text-[10px] text-muted-foreground'>
											{new Date(user.createdAt).toLocaleDateString()}
										</div>
									</div>
									<div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity'>
										<button
											onClick={() => resetUser(user.id)}
											disabled={userActionLoading === `reset-${user.id}`}
											className='p-1 rounded hover:bg-orange-500/20 text-orange-600 disabled:opacity-50'
											title='Reset user data'
										>
											{userActionLoading === `reset-${user.id}` ? (
												<Loader2 className='h-3 w-3 animate-spin' />
											) : (
												<RotateCcw className='h-3 w-3' />
											)}
										</button>
										<button
											onClick={() => deleteUser(user.id)}
											disabled={userActionLoading === `delete-${user.id}`}
											className='p-1 rounded hover:bg-red-500/20 text-red-600 disabled:opacity-50'
											title='Delete user'
										>
											{userActionLoading === `delete-${user.id}` ? (
												<Loader2 className='h-3 w-3 animate-spin' />
											) : (
												<Trash2 className='h-3 w-3' />
											)}
										</button>
									</div>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<div className='space-y-2'>
				<ActionButton
					icon={Users}
					label='Refresh Users'
					onClick={fetchUsers}
					loading={usersLoading}
				/>
			</div>
		</>
	)
}
