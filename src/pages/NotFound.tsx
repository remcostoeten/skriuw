import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { EmptyState } from '@/shared/ui/empty-state'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

const NotFound = () => {
    const location = useLocation()
    const navigate = useNavigate()

    useEffect(() => {
        console.error(
            '404 Error: User attempted to access non-existent route:',
            location.pathname
        )
    }, [location.pathname])

    return (
        <AppLayoutContainer>
            <div className="flex-1 flex items-center justify-center bg-background min-h-0">
                <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto px-6">
                    <EmptyState
                        variant="destructive"
                        message="404 - Page Not Found"
                        submessage={`The route "${location.pathname}" does not exist.`}
                        actions={[
                            {
                                label: 'Return to Home',
                                onClick: () => navigate('/')
                            }
                        ]}
                    />
                </div>
            </div>
        </AppLayoutContainer>
    )
}

export default NotFound
