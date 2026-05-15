'use client';
import { usePathname } from 'next/navigation';
import Nav from './Nav';

export default function NavWrapper() {
    const pathname = usePathname();
    const hidden =
        pathname === '/login' ||
        pathname === '/login/' ||
        pathname.startsWith('/onboarding');
    if (hidden) return null;
    return <Nav />;
}
