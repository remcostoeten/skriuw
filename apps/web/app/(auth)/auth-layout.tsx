import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@skriuw/ui";

type Props = {
    effectLayer: ReactNode;
    formPanel: ReactNode;
}

export default function AuthLayout({ effectLayer, formPanel }: Props) {
    return (
        <div className="relative w-screen h-screen overflow-hidden flex">
            {/* Left side - Effect/visual area */}
            <div className="flex-1 relative z-0">
                {effectLayer}
            </div>
            
            {/* Right side - Auth flow */}
            <div className="flex-1 relative z-10 bg-background border-l border-border">
                {/* Back button and logo in top left */}
                <div className="absolute top-8 left-8 flex items-center gap-4 z-20">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                        onClick={() => window.history.back()}
                    >
                        <ChevronLeft className="w-4 h-4" />
                        $PREVIOUSPAGE
                    </Button>
                    <Logo />
                </div>
                
                {/* Centered auth form */}
                <div className="w-full h-full flex items-center justify-center p-8">
                    <div className="w-full max-w-md">
                        {formPanel}
                    </div>
                </div>
            </div>
        </div>
    );
}
