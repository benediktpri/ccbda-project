'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {
                // Ignore registration failures; this is only best-effort cleanup for stale workers.
            });
        }
    }, []);

    return null;
}
