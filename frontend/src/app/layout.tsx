import './globals.css';
import type { Metadata } from 'next';
import NavWrapper from '@/components/NavWrapper';

export const metadata: Metadata = {
    title: 'CV Pipeline',
    description: 'CV analysis and skills-gap tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-slate-950 text-slate-100">
                <NavWrapper />
                <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
                {/* Registers a self-unregistering SW to evict any stale service workers */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');`,
                    }}
                />
            </body>
        </html>
    );
}
