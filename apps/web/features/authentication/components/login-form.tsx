import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Moon, Sun, User, Loader2 } from "lucide-react";
import { Button } from "@skriuw/ui";
import EmailAutocomplete from "./email-autocomplete";
import { PasswordInput } from "./password-input";
import { signIn, signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

type Props = {
    title?: string;
    subtitle?: string;
    isAnonymousUser?: boolean;
    anonymousDisplayName?: string;
    /** Called on successful authentication - use to close modal */
    onSuccess?: () => void;
}

export function LoginForm({
    title = "Welcome to skriuw",
    subtitle = "New here or coming back? Choose how you want to continue",
    isAnonymousUser = false,
    anonymousDisplayName = "Guest",
    onSuccess,
}: Props) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState(""); // Added for registration
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [showOtherOptions, setShowOtherOptions] = useState(true);
    const [passwordError, setPasswordError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [generalError, setGeneralError] = useState("");

    // Derived state: if user is anonymous, disable guest login and highlight other methods
    const disableGuestLogin = isAnonymousUser;
    const highlightOtherLoginMethods = isAnonymousUser;

    const handleAuthSuccess = async () => {
        try {
            await fetch('/api/user/seed', { method: 'POST' });
        } catch (e) {
            console.error('Seeding failed', e);
        }

        if (onSuccess) {
            onSuccess();
        } else {
            router.push("/");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError("");
        setGeneralError("");
        setIsLoading(true);

        try {
            if (isRegisterMode) {
                if (password !== confirmPassword) {
                    setPasswordError("Passwords do not match");
                    setIsLoading(false);
                    return;
                }

                await signUp.email({
                    email,
                    password,
                    name: name || email.split('@')[0], // Fallback name
                }, {
                    onSuccess: handleAuthSuccess,
                    onError: (ctx) => {
                        setPasswordError(ctx.error.message);
                        setIsLoading(false);
                    }
                });
            } else {
                await signIn.email({
                    email,
                    password,
                }, {
                    onSuccess: () => {
                        onSuccess ? onSuccess() : router.push("/");
                    },
                    onError: (ctx) => {
                        if (ctx.error.status === 401 || ctx.error.status === 403) {
                            setPasswordError("Invalid email or password");
                        } else {
                            setPasswordError(ctx.error.message);
                        }
                        setIsLoading(false);
                    }
                });
            }
        } catch (error) {
            setGeneralError("An unexpected error occurred. Please try again.");
            setIsLoading(false);
        }
    };

    const handleSocialLogin = async (provider: "github" | "google") => {
        setGeneralError("");
        setIsLoading(true);
        try {
            await signIn.social({
                provider
            }, {
                onSuccess: () => {
                    // Redirect handled by auth lib usually, or wait for callback
                },
                onError: (ctx) => {
                    setGeneralError(ctx.error.message);
                    setIsLoading(false);
                }
            });
        } catch (error) {
            setGeneralError("Failed to initiate social login");
            setIsLoading(false);
        }
    };

    const handleAnonymousLogin = async () => {
        setGeneralError("");
        setIsLoading(true);
        try {
            await signIn.anonymous({}, {
                onSuccess: () => {
                    onSuccess ? onSuccess() : router.push("/");
                },
                onError: (ctx) => {
                    setGeneralError(ctx.error.message);
                    setIsLoading(false);
                }
            });
        } catch (error) {
            setGeneralError("Failed to sign in anonymously");
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-8 relative">
            {/* Theme toggle */}


            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-2xl font-medium tracking-tight text-foreground">
                    {isRegisterMode ? "Create an account" : title}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {isRegisterMode ? "Enter your details to get started" : subtitle}
                </p>
            </div>

            {/* Login/Register form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {generalError && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                        {generalError}
                    </div>
                )}

                {/* Name field - only in register mode */}
                <AnimatePresence initial={false}>
                    {isRegisterMode && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-2 pb-4">
                                <label htmlFor="name-input" className="text-sm font-medium text-foreground">
                                    Full Name
                                </label>
                                <input
                                    id="name-input"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="flex h-12 w-full rounded-md border border-border bg-background px-4 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Email field with label */}
                <div className="space-y-2">
                    <label htmlFor="email-input" className="text-sm font-medium text-foreground">
                        Email
                    </label>
                    <EmailAutocomplete
                        id="email-input"
                        value={email}
                        onChange={setEmail}
                        placeholder="Enter your email"
                    />
                </div>

                {/* Password field with label */}
                <div className="space-y-2">
                    <label htmlFor="password-input" className="text-sm font-medium text-foreground">
                        Password
                    </label>
                    <PasswordInput
                        id="password-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                    />
                </div>

                {/* Confirm Password field - only in register mode */}
                <AnimatePresence initial={false}>
                    {isRegisterMode && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-2 pt-1">
                                <label htmlFor="confirm-password-input" className="text-sm font-medium text-foreground">
                                    Confirm Password
                                </label>
                                <PasswordInput
                                    id="confirm-password-input"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your password"
                                    autoComplete="new-password"
                                />
                                {passwordError && (
                                    <p className="text-sm text-destructive">{passwordError}</p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Button type="submit" className="w-full h-12 text-sm font-medium" disabled={isLoading}>
                    {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        null
                    )}
                    {isLoading ? "Please wait" : (isRegisterMode ? "Create Account" : "Continue")}
                </Button>

                {/* Toggle between login and register */}
                <button
                    type="button"
                    onClick={() => {
                        setIsRegisterMode(!isRegisterMode);
                        setPasswordError("");
                        setConfirmPassword("");
                        setGeneralError("");
                    }}
                    disabled={isLoading}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    {isRegisterMode ? (
                        <>Already have an account? <span className="underline">Sign in</span></>
                    ) : (
                        <>Don't have an account? <span className="underline">Register</span></>
                    )}
                </button>
            </form>

            {/* Divider */}
            <div className="flex items-center justify-center">
                <span className="text-sm text-muted-foreground">Or</span>
            </div>

            {/* Other options toggle */}
            <div className="space-y-4">
                <button
                    onClick={() => setShowOtherOptions(!showOtherOptions)}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
                >
                    Other options
                    <motion.div
                        animate={{ rotate: showOtherOptions ? 180 : 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <ChevronDown className="w-4 h-4" />
                    </motion.div>
                </button>

                {/* Animated options container */}
                <AnimatePresence initial={false}>
                    {showOtherOptions && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{
                                height: "auto",
                                opacity: 1,
                                transition: {
                                    height: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
                                    opacity: { duration: 0.3, delay: 0.1 }
                                }
                            }}
                            exit={{
                                height: 0,
                                opacity: 0,
                                transition: {
                                    height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                                    opacity: { duration: 0.2 }
                                }
                            }}
                            className="overflow-hidden"
                        >
                            <motion.div
                                className="space-y-3 pt-2"
                                initial={{ y: -10 }}
                                animate={{
                                    y: 0,
                                    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.1 }
                                }}
                                exit={{
                                    y: -10,
                                    transition: { duration: 0.2 }
                                }}
                            >
                                {/* GitHub - Primary */}
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSocialLogin("github")}
                                    disabled={isLoading}
                                    className={`w-full h-12 justify-center gap-3 text-sm font-medium ${highlightOtherLoginMethods ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                                        }`}
                                >
                                    <GithubIcon />
                                    Continue with Github
                                </Button>
                                {/* Google */}
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSocialLogin("google")}
                                    disabled={isLoading}
                                    className={`w-full h-12 justify-center gap-3 text-sm font-medium ${highlightOtherLoginMethods ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                                        }`}
                                >
                                    <GoogleIcon />
                                    Continue with Google
                                </Button>
                                {/* Anonymous / Demo */}
                                <Button
                                    variant="outline"
                                    onClick={handleAnonymousLogin}
                                    className="w-full h-12 justify-center gap-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                                    disabled={disableGuestLogin || isLoading}
                                >
                                    <User className="w-[18px] h-[18px]" />
                                    {isAnonymousUser ? `Logged in as ${anonymousDisplayName}` : "Continue as Guest"}
                                </Button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="pt-16 text-center">
                <p className="text-xs text-muted-foreground">
                    By signing in you agree to our{" "}
                    <a href="#" className="underline hover:text-foreground transition-colors">
                        Terms of service
                    </a>{" "}
                    &{" "}
                    <a href="#" className="underline hover:text-foreground transition-colors">
                        Privacy policy
                    </a>
                </p>
            </div>
        </div>
    );
};

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

const GithubIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
);

export default LoginForm;
