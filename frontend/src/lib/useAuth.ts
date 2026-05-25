'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { api } from './api';

const KEY = 'ccbda_auth';

interface AuthData {
    userId: string;
    email: string;
}

interface UseAuthReturn {
    userId: string | null;
    email: string | null;
    loading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

function subscribe(callback: () => void) {
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): string | null {
    return localStorage.getItem(KEY);
}

function getServerSnapshot(): null {
    return null;
}

function notifyStorage() {
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
}

export function useAuth(): UseAuthReturn {
    const storedJson = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const auth = useMemo<AuthData | null>(() => {
        if (!storedJson) return null;
        try {
            return JSON.parse(storedJson) as AuthData;
        } catch {
            localStorage.removeItem(KEY);
            return null;
        }
    }, [storedJson]);

    async function login(email: string, _password: string) {
        const user = await api.createUser();
        const data: AuthData = { userId: user.user_id, email };
        localStorage.setItem(KEY, JSON.stringify(data));
        notifyStorage();
    }

    function logout() {
        localStorage.removeItem(KEY);
        notifyStorage();
    }

    return {
        userId: auth?.userId ?? null,
        email: auth?.email ?? null,
        loading: false,
        isAuthenticated: auth !== null,
        login,
        logout,
    };
}
