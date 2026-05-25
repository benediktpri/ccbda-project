'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';

type Mode = 'signin' | 'signup' | 'confirm';

export default function LoginPage() {
    const router = useRouter();
    const { login, signUp, confirmSignUp, loading } = useAuth();
    const [mode, setMode] = useState<Mode>('signin');
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmEmail, setConfirmEmail] = useState('');
    const [code, setCode] = useState('');
    
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Redirect if already authenticated
    useEffect(() => {
        if (!loading) {
            const stored = localStorage.getItem('ccbda_auth');
            if (stored) router.replace('/profile');
        }
    }, [loading, router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (mode === 'signin') {
            if (!email.trim() || !password.trim()) {
                setError('Please enter your email and password.');
                return;
            }
            setSubmitting(true);
            try {
                await login(email.trim(), password);
                // Check if this user already has a processed profile
                const stored = localStorage.getItem('ccbda_auth');
                const userId = stored ? (JSON.parse(stored) as { userId: string }).userId : null;
                if (userId) {
                    try {
                        const status = await api.getProfileStatus(userId);
                        if (status.structured_status === 'done' || status.raw_status === 'done') {
                            router.replace('/profile');
                            return;
                        }
                    } catch {
                        // No profile yet — go to onboarding
                    }
                }
                router.replace('/onboarding');
            } catch (err: any) {
                if (err.code === 'UserNotConfirmedException') {
                    setConfirmEmail(email.trim());
                    setMode('confirm');
                    setError('Your account is not confirmed yet. Please enter the verification code sent to your email.');
                } else {
                    setError(err.message);
                }
                setSubmitting(false);
            }
        } else if (mode === 'signup') {
            if (!email.trim() || !password.trim()) {
                setError('Please enter your email and password.');
                return;
            }
            if (password.length < 8) {
                setError('Password must be at least 8 characters long.');
                return;
            }
            setSubmitting(true);
            try {
                await signUp(email.trim(), password);
                setConfirmEmail(email.trim());
                setMode('confirm');
                setSuccessMessage('Sign up successful! Please check your email for the verification code.');
            } catch (err: any) {
                setError(err.message);
            } finally {
                setSubmitting(false);
            }
        } else if (mode === 'confirm') {
            if (!code.trim()) {
                setError('Please enter the confirmation code.');
                return;
            }
            setSubmitting(true);
            try {
                await confirmSignUp(confirmEmail, code.trim());
                setMode('signin');
                setSuccessMessage('Email confirmed successfully! You can now sign in.');
                setPassword(''); // Clear password for security
            } catch (err: any) {
                setError(err.message);
            } finally {
                setSubmitting(false);
            }
        }
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-100">CV Pipeline</h1>
                    <p className="mt-2 text-slate-400">
                        {mode === 'signin' && 'Sign in to continue'}
                        {mode === 'signup' && 'Create your account'}
                        {mode === 'confirm' && 'Verify your email'}
                    </p>
                </div>

                <div className="bg-slate-900 rounded-2xl border border-slate-700 p-8 space-y-5">
                    {successMessage && (
                        <p className="text-sm text-green-400 bg-green-950/50 border border-green-800 rounded-lg px-3 py-2">
                            {successMessage}
                        </p>
                    )}

                    {error && (
                        <p className="text-sm text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode !== 'confirm' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        disabled={submitting}
                                        autoComplete="email"
                                        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600
                                            text-slate-100 placeholder:text-slate-500 text-sm
                                            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                            disabled:opacity-50 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        disabled={submitting}
                                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600
                                            text-slate-100 placeholder:text-slate-500 text-sm
                                            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                            disabled:opacity-50 transition"
                                    />
                                </div>
                            </>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Verification Code sent to <span className="text-indigo-400 font-semibold">{confirmEmail}</span>
                                </label>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={e => setCode(e.target.value)}
                                    placeholder="123456"
                                    disabled={submitting}
                                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600
                                        text-slate-100 placeholder:text-slate-500 text-sm font-mono tracking-widest text-center
                                        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                        disabled:opacity-50 transition"
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-medium text-sm
                                hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting && 'Processing…'}
                            {!submitting && mode === 'signin' && 'Sign in'}
                            {!submitting && mode === 'signup' && 'Sign up'}
                            {!submitting && mode === 'confirm' && 'Verify account'}
                        </button>
                    </form>

                    <div className="pt-2 border-t border-slate-800 text-center text-xs text-slate-400 space-y-2">
                        {mode === 'signin' && (
                            <p>
                                Don&apos;t have an account?{' '}
                                <button
                                    onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                                    className="text-indigo-400 hover:underline font-medium"
                                >
                                    Sign up here
                                </button>
                            </p>
                        )}
                        {mode === 'signup' && (
                            <p>
                                Already have an account?{' '}
                                <button
                                    onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
                                    className="text-indigo-400 hover:underline font-medium"
                                >
                                    Sign in here
                                </button>
                            </p>
                        )}
                        {mode === 'confirm' && (
                            <button
                                onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
                                className="text-slate-400 hover:underline"
                            >
                                Back to Sign in
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
