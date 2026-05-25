'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import type { Language, Compensation } from '@/lib/types';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 40;

type UploadStatus = 'idle' | 'uploading' | 'polling' | 'done' | 'error';

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function OnboardingPage() {
    const router = useRouter();
    const { userId, loading: authLoading, isAuthenticated } = useAuth();
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.replace('/login');
        }
    }, [authLoading, isAuthenticated, router]);

    // Skip onboarding if profile already ready
    useEffect(() => {
        if (!userId) return;
        api
            .getProfileStatus(userId)
            .then(status => {
                if (status.structured_status === 'ready') {
                    router.replace('/profile');
                }
            })
            .catch(() => { });
    }, [userId, router]);

    if (authLoading || !userId) return null;

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-start pt-10 px-4">
            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-10">
                {([1, 2, 3] as const).map(n => (
                    <div key={n} className="flex items-center gap-3">
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${n < step
                                ? 'bg-indigo-600 text-white'
                                : n === step
                                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-950'
                                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                                }`}
                        >
                            {n < step ? '✓' : n}
                        </div>
                        {n < 3 && (
                            <div className={`w-12 h-px ${n < step ? 'bg-indigo-600' : 'bg-slate-700'}`} />
                        )}
                    </div>
                ))}
            </div>

            <div className="w-full max-w-lg">
                {step === 1 && (
                    <Step1Upload userId={userId} onNext={() => setStep(2)} />
                )}
                {step === 2 && (
                    <Step2Questions userId={userId} onNext={() => setStep(3)} />
                )}
                {step === 3 && (
                    <Step3Done onDone={() => router.replace('/profile')} />
                )}
            </div>
        </div>
    );
}

// ─── Step 1: Upload CV ────────────────────────────────────────────────────────

function Step1Upload({ userId, onNext }: { userId: string; onNext: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [message, setMessage] = useState('');
    const pollCount = useRef(0);
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = () => {
        if (pollTimer.current) clearInterval(pollTimer.current);
    };

    const poll = useCallback(
        async (uid: string) => {
            pollCount.current += 1;
            if (pollCount.current > MAX_POLLS) {
                stopPolling();
                setStatus('error');
                setMessage('Processing timed out. You can skip and continue.');
                return;
            }
            try {
                const s = await api.getProfileStatus(uid);
                if (s.structured_status === 'ready' || s.raw_status === 'ready') {
                    stopPolling();
                    setStatus('done');
                    setMessage('CV processed successfully!');
                    setTimeout(onNext, 800);
                } else if (s.raw_status === 'error' || s.structured_status === 'error') {
                    stopPolling();
                    setStatus('error');
                    setMessage('Processing failed. You can try again or skip.');
                }
            } catch {
                // keep polling on transient errors
            }
        },
        [onNext],
    );

    async function handleUpload() {
        if (!file) return;
        setStatus('uploading');
        setMessage('Uploading…');
        pollCount.current = 0;
        try {
            await api.uploadCV(userId, file);
            setStatus('polling');
            setMessage('Processing your CV…');
            pollTimer.current = setInterval(() => poll(userId), POLL_INTERVAL);
            poll(userId);
        } catch (err) {
            setStatus('error');
            setMessage((err as Error).message);
        }
    }

    const busy = status === 'uploading' || status === 'polling';

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-100">Upload your CV</h2>
                <p className="mt-1 text-slate-400">
                    We&apos;ll extract your profile automatically. You can also skip this step.
                </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-4">
                <label
                    className={`flex flex-col items-center justify-center w-full h-36 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${file
                        ? 'border-indigo-500 bg-indigo-950/30'
                        : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'
                        } ${busy ? 'pointer-events-none opacity-50' : ''}`}
                >
                    <input
                        type="file"
                        accept="application/pdf"
                        disabled={busy}
                        onChange={e => {
                            setFile(e.target.files?.[0] ?? null);
                            setStatus('idle');
                            setMessage('');
                        }}
                        className="hidden"
                    />
                    {file ? (
                        <div className="text-center">
                            <p className="text-sm font-medium text-indigo-300">📄 {file.name}</p>
                            <p className="text-xs text-slate-400 mt-1">Click to change file</p>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-2xl mb-2">📎</p>
                            <p className="text-sm font-medium text-slate-300">Click to select PDF</p>
                            <p className="text-xs text-slate-500 mt-1">Max 10 MB</p>
                        </div>
                    )}
                </label>

                {status === 'polling' && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Spinner /> {message}
                    </div>
                )}
                {status === 'done' && (
                    <p className="text-sm text-green-400 font-medium">{message}</p>
                )}
                {status === 'error' && <p className="text-sm text-red-400">{message}</p>}

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={handleUpload}
                        disabled={!file || busy}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {busy ? 'Processing…' : 'Upload & Continue'}
                    </button>
                    <button
                        onClick={onNext}
                        disabled={busy}
                        className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg font-medium text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors border border-slate-700"
                    >
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Step 2: Follow-up questions ──────────────────────────────────────────────

function Step2Questions({ userId, onNext }: { userId: string; onNext: () => void }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [location, setLocation] = useState('');
    const [relocate, setRelocate] = useState(false);
    const [compMin, setCompMin] = useState('');
    const [compMax, setCompMax] = useState('');
    const [currency, setCurrency] = useState('EUR');
    const [languages, setLanguages] = useState<Language[]>([{ language: '', level: null }]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Pre-fill from processed CV
    useEffect(() => {
        api
            .getProfile(userId)
            .then(p => {
                if (p.first_name) setFirstName(p.first_name);
                if (p.last_name) setLastName(p.last_name);
                if (p.location) setLocation(p.location);
                if (p.willingness_to_relocate != null) setRelocate(p.willingness_to_relocate);
                if (p.target_compensation) {
                    if (p.target_compensation.min) setCompMin(String(p.target_compensation.min));
                    if (p.target_compensation.max) setCompMax(String(p.target_compensation.max));
                    if (p.target_compensation.currency) setCurrency(p.target_compensation.currency);
                }
                if (p.languages?.length) setLanguages(p.languages);
            })
            .catch(() => { });
    }, [userId]);

    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            const comp: Compensation | null =
                compMin || compMax
                    ? {
                        min: compMin ? Number(compMin) : null,
                        max: compMax ? Number(compMax) : null,
                        currency: currency || null,
                    }
                    : null;
            await api.updateProfile(userId, {
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                location: location.trim() || null,
                willingness_to_relocate: relocate,
                target_compensation: comp,
                languages: languages.filter(l => l.language.trim()),
            });
            onNext();
        } catch (err) {
            setError((err as Error).message);
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-100">A few details</h2>
                <p className="mt-1 text-slate-400">
                    Help us personalise your profile. All fields are optional.
                </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                            First name
                        </label>
                        <input
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            placeholder="Jane"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                            Last name
                        </label>
                        <input
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            placeholder="Doe"
                            className={inputCls}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Location
                    </label>
                    <input
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder="Barcelona, Spain"
                        className={inputCls}
                    />
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setRelocate(r => !r)}
                        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${relocate ? 'bg-indigo-600' : 'bg-slate-700'
                            }`}
                    >
                        <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${relocate ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                        />
                    </button>
                    <span className="text-sm text-slate-300">Open to relocate</span>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Target compensation
                    </label>
                    <div className="flex gap-2">
                        <input
                            value={compMin}
                            onChange={e => setCompMin(e.target.value)}
                            type="number"
                            placeholder="Min"
                            className={inputCls}
                        />
                        <input
                            value={compMax}
                            onChange={e => setCompMax(e.target.value)}
                            type="number"
                            placeholder="Max"
                            className={inputCls}
                        />
                        <input
                            value={currency}
                            onChange={e => setCurrency(e.target.value)}
                            placeholder="EUR"
                            className={`${inputCls} w-24`}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                        Languages
                    </label>
                    <div className="space-y-2">
                        {languages.map((l, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <input
                                    value={l.language}
                                    onChange={e => {
                                        const next = [...languages];
                                        next[i] = { ...next[i], language: e.target.value };
                                        setLanguages(next);
                                    }}
                                    placeholder="Language"
                                    className={`${inputCls} flex-1`}
                                />
                                <input
                                    value={l.level ?? ''}
                                    onChange={e => {
                                        const next = [...languages];
                                        next[i] = { ...next[i], level: e.target.value || null };
                                        setLanguages(next);
                                    }}
                                    placeholder="Level (B2, Native…)"
                                    className={`${inputCls} flex-1`}
                                />
                                {languages.length > 1 && (
                                    <button
                                        onClick={() =>
                                            setLanguages(languages.filter((_, j) => j !== i))
                                        }
                                        className="text-slate-500 hover:text-red-400 px-1"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={() =>
                                setLanguages([...languages, { language: '', level: null }])
                            }
                            className="text-sm text-indigo-400 hover:text-indigo-300"
                        >
                            + Add language
                        </button>
                    </div>
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? 'Saving…' : 'Save & Continue'}
                    </button>
                    <button
                        onClick={onNext}
                        disabled={saving}
                        className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg font-medium text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors border border-slate-700"
                    >
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function Step3Done({ onDone }: { onDone: () => void }) {
    return (
        <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <div>
                <h2 className="text-2xl font-bold text-slate-100">You&apos;re all set!</h2>
                <p className="mt-2 text-slate-400">
                    Your profile is ready. Let&apos;s find your next opportunity.
                </p>
            </div>
            <button
                onClick={onDone}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-500 transition-colors"
            >
                Go to Profile
            </button>
        </div>
    );
}

function Spinner() {
    return (
        <svg
            className="animate-spin h-4 w-4 text-indigo-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}
