
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, User, Search, MessageSquare, Edit3, LogOut, Menu, ShieldCheck, FileWarning, Users as UsersIcon, BarChart3, Megaphone, Bell } from 'lucide-react'; // Added Bell
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from '@/components/logo';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';


const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/announcements', label: 'Announcements', icon: Bell }, // Added Announcements
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/search', label: 'Search Users', icon: Search },
  { href: '/chat', label: 'Chats', icon: MessageSquare },
  { href: '/chat/new-group', label: 'New Group', icon: UsersIcon },
  { href: '/status/new', label: 'New Status', icon: Edit3 },
];

const adminNavItems = [
    { href: '/admin/users', label: 'Manage Users', icon: ShieldCheck },
    { href: '/admin/reports', label: 'Chat Reports', icon: FileWarning },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
]

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { userProfile } = useAuth(); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
      router.push('/login');
    } catch (error) {
      toast({ title: 'Logout Failed', description: 'Could not log you out. Please try again.', variant: 'destructive' });
    }
  };

  const NavContent = () => (
    <>
      <div className="p-4 border-b border-border">
        <Logo />
      </div>
      <nav className="flex-grow px-4 py-6 space-y-2">
        {navItems.map((item) => (
          <Link key={item.label} href={item.href} passHref legacyBehavior>
            <a
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                'flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                (pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard' && !item.href.startsWith('/admin') && item.href !== '/chat' && item.href !== '/announcements')) || 
                (item.href === '/chat' && (pathname === '/chat' || pathname.startsWith('/chat/'))) && !(item.href === '/chat' && pathname.startsWith('/chat/new-group')) ||
                (item.href === '/announcements' && pathname === '/announcements')
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </a>
          </Link>
        ))}
        {userProfile?.isAdmin && (
            <>
                <div className="pt-4 pb-2 px-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Admin</p>
                </div>
                {adminNavItems.map((item) => (
                    <Link key={item.label} href={item.href} passHref legacyBehavior>
                        <a
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                            'flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                            pathname.startsWith(item.href)
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground'
                        )}
                        >
                        <item.icon className="h-5 w-5" />
                        <span>{item.label}</span>
                        </a>
                    </Link>
                ))}
            </>
        )}
      </nav>
      <div className="px-4 py-4 border-t border-border mt-auto">
         <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-foreground/70 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Logout
          </Button>
      </div>
    </>
  );


  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-card border-r border-border shadow-sm fixed inset-y-0">
        <NavContent />
      </aside>

      {/* Mobile Sidebar Trigger */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden fixed top-4 left-4 z-50 bg-card/80 backdrop-blur-sm hover:bg-card">
            <Menu className="h-6 w-6 text-primary" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 bg-card border-r border-border flex flex-col" title="Navigation Menu">
           <NavContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
