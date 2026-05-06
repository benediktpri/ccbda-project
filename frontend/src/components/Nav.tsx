'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links: { href: string; label: string }[] = [
  { href: '/upload', label: 'Upload CV' },
  { href: '/profile', label: 'Profile' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/analysis', label: 'Skills Gap' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 flex items-center gap-1 h-14">
        <span className="font-semibold text-slate-800 mr-4">CV Pipeline</span>
        {links.map(({ href, label }) => {
          const active = pathname === href || pathname === `${href}/`;
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
