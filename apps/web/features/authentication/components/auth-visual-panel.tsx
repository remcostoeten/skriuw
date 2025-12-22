import { BrandLogo } from "@/components/brand-logo";
import { motion } from "framer-motion";

export function AuthVisualPanel() {
    return (
        <div className="relative w-full h-full overflow-hidden bg-zinc-900 rounded-2xl flex flex-col items-center justify-center p-8 text-center relative">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] bg-blue-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] bg-purple-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            {/* Glassmorphism Pattern */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]" />

            <div className="relative z-10 flex flex-col items-center gap-8">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    {/* Using the BrandLogo component */}
                    <BrandLogo
                        size={180}
                        variant="explanation"
                        className="text-white drop-shadow-2xl"
                    />
                </motion.div>

                <div className="space-y-4 max-w-md">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="text-3xl font-bold tracking-tight text-white"
                    >
                        Welcome Back
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="text-zinc-400 text-lg"
                    >
                        Write freely, organize beautifully, share effortlessly.
                    </motion.p>
                </div>
            </div>

            {/* subtle overlay geometric pattern */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 grayscale" />
        </div>
    );
};
