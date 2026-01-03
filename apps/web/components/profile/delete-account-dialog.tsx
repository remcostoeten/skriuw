'use client'

import { useState } from 'react'
import {
    DrawerDialog,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@skriuw/ui/dialog-drawer'
import { Button } from '@skriuw/ui/button'
import { Input } from '@skriuw/ui/input'
import { Label } from '@skriuw/ui/label'
import { Alert, AlertDescription } from '@skriuw/ui/alert'
import { AlertTriangle } from 'lucide-react'

interface DeleteAccountDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isDeleting?: boolean
}

export function DeleteAccountDialog({
    isOpen,
    onClose,
    onConfirm,
    isDeleting = false,
}: DeleteAccountDialogProps) {
    const [confirmPhrase, setConfirmPhrase] = useState('')
    const REQUIRED_PHRASE = 'delete my account'
    const isConfirmed = confirmPhrase.toLowerCase() === REQUIRED_PHRASE

    function handleConfirm() {
        if (isConfirmed) {
            onConfirm()
        }
    }

    return (
        <DrawerDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="sm:max-w-md border-destructive/20">
                <DrawerHeader>
                    <DrawerTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Account
                    </DrawerTitle>
                    <DrawerDescription>
                        This action cannot be undone. This will permanently delete your
                        account and remove your data from our servers.
                    </DrawerDescription>
                </DrawerHeader>

                <div className="flex flex-col gap-4 py-4 px-4 sm:px-0">
                    <Alert variant="destructive" className="bg-destructive/5 text-destructive border-destructive/20">
                        <AlertDescription>
                            Unexpected bad things will happen if you don't read this!
                        </AlertDescription>
                    </Alert>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="confirm-phrase" className="text-sm font-medium">
                            To confirm, type <span className="font-bold select-none">"{REQUIRED_PHRASE}"</span> below:
                        </Label>
                        <Input
                            id="confirm-phrase"
                            value={confirmPhrase}
                            onChange={(e) => setConfirmPhrase(e.target.value)}
                            placeholder={REQUIRED_PHRASE}
                            className="border-destructive/30 focus-visible:ring-destructive/30 focus-visible:border-destructive"
                            autoComplete="off"
                        />
                    </div>
                </div>

                <DrawerFooter className="gap-2 sm:gap-0 px-4 pb-6 sm:px-0 sm:pb-0">
                    <Button variant="outline" onClick={onClose} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!isConfirmed || isDeleting}
                        className="gap-2"
                    >
                        {isDeleting ? 'Deleting...' : 'Delete my account'}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </DrawerDialog>
    )
}
