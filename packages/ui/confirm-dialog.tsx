import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./alert-dialog";
import { Button } from "./button";
import { useState } from "react";

export type ConfirmDialogOptions = {
	title: string
	description: string
	confirmText?: string
	cancelText?: string
	variant?: 'default' | 'destructive'
}

export type ConfirmDialogState = {
	isOpen: boolean
	options: ConfirmDialogOptions | null
	resolve: ((value: boolean) => void) | null
}

/**
 * Reusable confirmation dialog hook
 * Returns a function that shows a confirmation dialog and returns a promise
 *
 * @example
 * const confirm = useConfirmDialog();
 * const confirmed = await confirm({
 *   title: "Delete item?",
 *   description: "This action cannot be undone.",
 *   variant: "destructive"
 * });
 * if (confirmed) {
 *   // User confirmed
 * }
 */
export function useConfirmDialog() {
	const [state, setState] = useState<ConfirmDialogState>({
		isOpen: false,
		options: null,
		resolve: null
	})

	const confirm = (options: ConfirmDialogOptions): Promise<boolean> => {
		return new Promise((resolve) => {
			setState({
				isOpen: true,
				options,
				resolve
			})
		})
	}

	const handleConfirm = () => {
		if (state.resolve) {
			state.resolve(true)
		}
		setState({ isOpen: false, options: null, resolve: null })
	}

	const handleCancel = () => {
		if (state.resolve) {
			state.resolve(false)
		}
		setState({ isOpen: false, options: null, resolve: null })
	}

	const ConfirmDialogComponent = () => {
		if (!state.options) return null

		const {
			title,
			description,
			confirmText = 'Confirm',
			cancelText = 'Cancel',
			variant = 'default'
		} = state.options

		return (
			<AlertDialog
				open={state.isOpen}
				onOpenChange={(open) => {
					if (!open) {
						handleCancel()
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{title}</AlertDialogTitle>
						<AlertDialogDescription>{description}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel asChild>
							<Button variant='outline' onClick={handleCancel}>
								{cancelText}
							</Button>
						</AlertDialogCancel>
						<AlertDialogAction asChild>
							<Button
								variant={variant === 'destructive' ? 'destructive' : 'default'}
								onClick={handleConfirm}
							>
								{confirmText}
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		)
	}

	return {
		confirm,
		ConfirmDialog: ConfirmDialogComponent
	}
}
