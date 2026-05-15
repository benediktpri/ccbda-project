'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { api } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const { login, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect if already authenticated
    useEffect(() => {
        if (!loading) {
            const stored = localStorage.getItem('ccbda_auth');
            if (stored) router.replace('/profile');
        }
    }, [loading, router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            setError('Please enter your email and password.');
            return;
        }
        setSubmitting(true);
        setError(null);
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
        } catch (err) {
            setError((err as Error).message);
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-100">CV Pipeline</h1>
                    <p className="mt-2 text-slate-400">Sign in to continue</p>
                </div>

                <div className="bg-slate-900 rounded-2xl border border-slate-700 p-8 space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                                autoComplete="current-password"
                                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-600
                                    text-slate-100 placeholder:text-slate-500 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                    disabled:opacity-50 transition"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-medium text-sm
                                hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>

                    <p className="text-center text-xs text-slate-500">
                        New here? Just enter any email and password to get started.
                    </p>
                </div>
            </div>
        </div>
    );
}
