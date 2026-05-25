'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 40;

type UploadStatus = 'idle' | 'uploading' | 'polling' | 'done' | 'error';

export default function UploadPage() {
    const { userId, loading: authLoading, isAuthenticated } = useAuth();
    const router = useRouter();

    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [message, setMessage] = useState('');
    const pollCount = useRef(0);
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.replace('/login');
    }, [authLoading, isAuthenticated, router]);

    const stopPolling = () => {
        if (pollTimer.current) clearInterval(pollTimer.current);
    };

    const poll = useCallback(
        async (uid: string) => {
            pollCount.current += 1;
            if (pollCount.current > MAX_POLLS) {
                stopPolling();
                setStatus('error');
                setMessage('Processing timed out. Please try again.');
                return;
            }
            try {
                const s = await api.getProfileStatus(uid);
                if (s.structured_status === 'ready') {
                    stopPolling();
                    setStatus('done');
                    setMessage('Profile ready!');
                    setTimeout(() => router.push('/profile'), 800);
                } else if (s.raw_status === 'error' || s.structured_status === 'error') {
                    stopPolling();
                    setStatus('error');
                    setMessage('Processing failed. Please re-upload your CV.');
                }
            } catch {
                // keep polling on transient errors
            }
        },
        [router],
    );

    async function handleUpload() {
        if (!file || !userId) return;
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

    if (authLoading) return <p className="text-slate-400">Initialising…</p>;

    const busy = status === 'uploading' || status === 'polling';

    return (
        <div className="max-w-lg mx-auto">
            <h1 className="text-2xl font-bold text-slate-100 mb-6">Upload your CV</h1>

            <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 space-y-4">
                <label className="block">
                    <span className="text-sm font-medium text-slate-300">PDF file (max 10 MB)</span>
                    <input
                        type="file"
                        accept="application/pdf"
                        disabled={busy}
                        onChange={e => {
                            setFile(e.target.files?.[0] ?? null);
                            setStatus('idle');
                            setMessage('');
                        }}
                        className="mt-1 block w-full text-sm text-slate-500
                            file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0
                            file:text-sm file:font-medium file:bg-slate-800 file:text-slate-300
                            hover:file:bg-slate-700 disabled:opacity-50"
                    />
                </label>

                {file && (
                    <p className="text-sm text-slate-400 truncate">
                        Selected: <span className="font-medium text-slate-200">{file.name}</span>
                    </p>
                )}

                <button
                    onClick={handleUpload}
                    disabled={!file || busy}
                    className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {busy ? 'Processing…' : 'Upload'}
                </button>

                {status === 'polling' && (
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                        <Spinner />
                        <span>{message}</span>
                    </div>
                )}

                {status === 'done' && (
                    <p className="text-green-400 font-medium text-sm">{message} Redirecting…</p>
                )}

                {status === 'error' && <p className="text-red-400 text-sm">{message}</p>}
            </div>

            <p className="mt-4 text-xs text-slate-500">
                User ID: <code className="font-mono">{userId}</code>
            </p>
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
