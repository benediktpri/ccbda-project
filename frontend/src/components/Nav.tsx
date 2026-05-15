'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

const links: { href: string; label: string }[] = [
    { href: '/profile', label: 'Profile' },
    { href: '/jobs', label: 'Jobs' },
];

export default function Nav() {
    const pathname = usePathname();
    const router = useRouter();
    const { email, logout } = useAuth();

    function handleLogout() {
        logout();
        router.replace('/login');
    }

    return (
        <nav className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
            <div className="max-w-4xl mx-auto px-4 flex items-center gap-1 h-14">
                <span className="font-semibold text-slate-100 mr-4">CV Pipeline</span>
                {links.map(({ href, label }) => {
                    const active = pathname === href || pathname === `${href}/`;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                                }`}
                        >
                            {label}
                        </Link>
                    );
                })}
                <div className="ml-auto flex items-center gap-3">
                    {email && (
                        <span className="text-xs text-slate-400 hidden sm:block truncate max-w-[10rem]">
                            {email}
                        </span>
                    )}
                    <button
                        onClick={handleLogout}
                        className="text-sm px-3 py-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </nav>
    );
}
