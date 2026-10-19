'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (pathname === '/coming-soon' || pathname.startsWith('/balance/') || pathname === '/admin' || pathname.startsWith('/admin/orders/')) ? null : children;
}
