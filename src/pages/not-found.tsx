import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { EmptyState } from '@/shared/ui/empty-state'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'
import { logStorageEvent } from '@/features/storage-status/utils/storage-event-log'


export default function NotFound() {
    const location = useLocation()
    const navigate = useNavigate()

    useEffect(() => {
        console.error(
            '404 Error: User attempted to access non-existent route:',
            location.pathname
        )

        logStorageEvent({
            storageKey: '__router__',
            eventType: 'route-error',
            source: 'router',
            description: `Route not found: ${location.pathname}${location.search}`
        })
    }, [location.pathname, location.search])

    return (
        <AppLayoutContainer>
            <EmptyState
                message="404 - Page Not Found"
                isFull
                submessage={`The route "${location.pathname}" does not exist.`}
                actions={[
                    {
                        label: 'Return to Home',
                        onClick: () => navigate('/')
                    }
                ]}
            />
        </AppLayoutContainer>
    )
}