import { ReactNode } from "react";

type Props = {
    visualPanel: ReactNode;
    formPanel: ReactNode;
    reversed?: boolean;
}

export default function AuthLayout({ visualPanel, formPanel, reversed = false }: Props) {
    return (
        <div className="auth-container bg-muted">
            <div className="auth-frame bg-background flex flex-col lg:flex-row">
                {reversed ? (
                    <>
                        <div className="flex-1 flex items-center justify-center p-8 lg:p-16 order-1 lg:order-2">
                            {formPanel}
                        </div>
                        <div className="hidden lg:block lg:flex-1 p-4 order-2 lg:order-1">
                            {visualPanel}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="hidden lg:block lg:flex-1 p-4">
                            {visualPanel}
                        </div>
                        <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
                            {formPanel}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
