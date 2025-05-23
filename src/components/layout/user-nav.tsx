
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase'; 
import { signOut } from 'firebase/auth';
import { LayoutDashboard, LogOut, User as UserIcon, ShieldCheck } from 'lucide-react'; 
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from './theme-toggle'; // Added ThemeToggle import

export function UserNav() {
  const { user, userProfile } = useAuth(); 
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login'); 
  };

  if (!user) {
    return null; 
  }

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  }

  return (
    <div className="flex items-center gap-2"> {/* Wrapper div for UserNav and ThemeToggle */}
      <ThemeToggle /> {/* Added ThemeToggle component */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10 border-2 border-primary">
              <AvatarImage src={userProfile?.profileImageUrl || undefined} alt={userProfile?.name || 'User Avatar'} data-ai-hint="avatar profile"/>
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {getInitials(userProfile?.name, userProfile?.email)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none truncate">{userProfile?.name || 'User'}</p>
              <p className="text-xs leading-none text-muted-foreground truncate">
                {userProfile?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <Link href="/dashboard" passHref>
              <DropdownMenuItem className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </DropdownMenuItem>
            </Link>
            <Link href="/profile" passHref>
              <DropdownMenuItem className="cursor-pointer">
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
            </Link>
            {userProfile?.isAdmin && (
              <Link href="/admin/users" passHref>
                  <DropdownMenuItem className="cursor-pointer">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  <span>Admin Panel</span>
                  </DropdownMenuItem>
              </Link>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
