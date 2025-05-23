
'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Announcement } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Bell, Loader2, Info } from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const announcementsQuery = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(announcementsQuery, (querySnapshot) => {
      const fetchedAnnouncements: Announcement[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedAnnouncements.push({ 
          id: doc.id, 
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(data.createdAt) 
        } as Announcement);
      });
      setAnnouncements(fetchedAnnouncements);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching announcements:", error);
      setIsLoading(false);
      // Optionally, show a toast error
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <header className="flex items-center space-x-3">
        <Bell className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Announcements</h1>
          <p className="text-muted-foreground">Stay updated with the latest news and updates from Hellohi.</p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading announcements...</p>
        </div>
      ) : announcements.length === 0 ? (
        <Card className="shadow-lg">
          <CardContent className="py-10 flex flex-col items-center justify-center">
            <Info className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-xl font-semibold text-foreground">No Announcements Yet</p>
            <p className="text-muted-foreground">Check back later for updates from the admin team.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {announcements.map((announcement) => (
            <Card key={announcement.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-xl">Message from Admin</CardTitle>
                <CardDescription>
                  Posted {formatDistanceToNowStrict(new Date(announcement.createdAt as any), { addSuffix: true })}
                  <span className="text-xs text-muted-foreground/80 ml-2">({format(new Date(announcement.createdAt as any), 'MMM d, yyyy HH:mm')})</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap">{announcement.text}</p>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                Sent by: {announcement.sentByName || 'Admin'}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
