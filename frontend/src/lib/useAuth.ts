'use client';
import { useState } from 'react';
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

export function useAuth(): UseAuthReturn {
    const [auth, setAuth] = useState<AuthData | null>(() => {
        if (typeof window === 'undefined') return null;
        const stored = localStorage.getItem(KEY);
        if (stored) {
            try {
                return JSON.parse(stored) as AuthData;
            } catch {
                localStorage.removeItem(KEY);
            }
        }
        return null;
    });

    async function login(email: string, _password: string) {
        const user = await api.createUser();
        const data: AuthData = { userId: user.user_id, email };
        localStorage.setItem(KEY, JSON.stringify(data));
        setAuth(data);
    }

    function logout() {
        localStorage.removeItem(KEY);
        setAuth(null);
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
