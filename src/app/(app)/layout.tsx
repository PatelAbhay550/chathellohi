'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { UserNav } from '@/components/layout/user-nav';
import { Loader2, Menu } from 'lucide-react';
import Logo from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';


export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticating } = useAuth();
  const router = useRouter();
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);


  useEffect(() => {
    if (!isAuthenticating && !user) {
      router.replace('/login');
    }
  }, [user, isAuthenticating, router]);

  if (isAuthenticating || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col md:ml-64">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6 shadow-sm">
          {/* SheetTrigger for AppSidebar is handled within AppSidebar itself for mobile */}
          <div className="ml-12"> {/* Spacer for menu button */}
             <Logo />
          </div>
          <UserNav />
        </header>
        {/* Desktop Header */}
        <header className="hidden md:flex sticky top-0 z-40 h-16 items-center justify-end border-b border-border bg-card px-6 shadow-sm">
          <UserNav />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
