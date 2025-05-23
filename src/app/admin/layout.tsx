
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import Logo from '@/components/logo';
import { UserNav } from '@/components/layout/user-nav';
import { Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, isAuthenticating } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticating) {
      if (!userProfile || !userProfile.isAdmin) {
        // If not authenticating, and no user profile or user is not admin
        router.replace('/dashboard'); // Or a dedicated "access denied" page
      }
    }
  }, [userProfile, isAuthenticating, router]);

  if (isAuthenticating) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!userProfile || !userProfile.isAdmin) {
    // This will show briefly before redirect or if redirect fails
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to view this page.</p>
        <Button asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    );
  }

  // Admin is verified, render the layout
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/users" className="flex items-center gap-2 font-semibold">
            <Logo disableLink={true} /> {/* &lt;-- Changed this line */}
            <span className="hidden sm:inline-block text-lg text-primary">Admin Panel</span>
          </Link>
        </div>
        <UserNav />
      </header>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {children}
      </main>
      <footer className="py-4 px-6 text-center text-xs text-muted-foreground border-t border-border">
        Hellohi Admin Panel &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
