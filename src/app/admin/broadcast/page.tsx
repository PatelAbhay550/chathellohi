
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, Megaphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { UserProfile } from '@/types';

export default function AdminBroadcastPage() {
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user, userProfile } = useAuth();

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) {
      toast({ title: "Empty Message", description: "Please write a message to broadcast.", variant: "destructive" });
      return;
    }
    if (!user || !userProfile) {
       toast({ title: "Not Authenticated", description: "You need to be logged in as an admin.", variant: "destructive" });
      return;
    }
    if (!userProfile.isAdmin) {
        toast({ title: "Not Authorized", description: "You do not have permission to send broadcasts.", variant: "destructive" });
       return;
     }

    setIsLoading(true);

    try {
      await addDoc(collection(db, 'announcements'), {
        text: messageText.trim(),
        createdAt: serverTimestamp(),
        sentByUid: user.uid,
        sentByName: userProfile.name || userProfile.username || 'Admin',
      });

      toast({ title: "Broadcast Sent!", description: "Your message has been queued for broadcast." });
      setMessageText('');
    } catch (error: any) {
      console.error("Failed to send broadcast:", error);
      toast({ title: "Broadcast Failed", description: error.message || "Could not send broadcast.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="flex items-center space-x-3">
        <Megaphone className="h-8 w-8 text-primary" />
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Send Broadcast Message</h1>
            <p className="text-muted-foreground">Communicate important updates to all users.</p>
        </div>
      </header>

      <Card className="shadow-xl">
        <form onSubmit={handleSendBroadcast}>
          <CardHeader>
            <CardTitle>New Broadcast</CardTitle>
            <CardDescription>This message will be sent to all users. Use with discretion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Textarea
              placeholder="Type your broadcast message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={6}
              className="resize-y"
              aria-label="Broadcast message input"
              maxLength={1000}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto ml-auto">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Broadcast
            </Button>
          </CardFooter>
        </form>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle className="text-base">Note on Delivery</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground">
                Currently, this feature only saves the announcement to the database.
                Displaying these announcements to users in real-time (e.g., via in-app notifications or a dedicated announcements feed)
                requires additional client-side implementation.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
