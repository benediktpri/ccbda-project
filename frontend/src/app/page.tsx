'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
    const router = useRouter();
    useEffect(() => {
        const stored = localStorage.getItem('ccbda_auth');
        if (stored) {
            router.replace('/profile');
        } else {
            router.replace('/login');
        }
    }, [router]);
    return null;
}
