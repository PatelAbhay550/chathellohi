
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageCircle, FileWarningIcon, BarChart3, Loader2 } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  totalUsers: number | null;
  activeUsersToday: number | null; // Example: more complex to implement accurately without more data
  totalChatRooms: number | null;
  totalP2PChats: number | null;
  totalGroupChats: number | null;
  totalReports: number | null;
  pendingReports: number | null;
}

export default function AdminAnalyticsPage() {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalUsers: null,
    activeUsersToday: null,
    totalChatRooms: null,
    totalP2PChats: null,
    totalGroupChats: null,
    totalReports: null,
    pendingReports: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userProfile || !userProfile.isAdmin) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const totalUsers = usersSnapshot.size;

        const chatRoomsSnapshot = await getDocs(collection(db, "chat_rooms"));
        const totalChatRooms = chatRoomsSnapshot.size;
        let totalP2PChats = 0;
        let totalGroupChats = 0;
        chatRoomsSnapshot.forEach(doc => {
            if (doc.data().isGroup) {
                totalGroupChats++;
            } else {
                totalP2PChats++;
            }
        });

        const reportsSnapshot = await getDocs(collection(db, "chat_reports"));
        const totalReports = reportsSnapshot.size;
        
        const pendingReportsQuery = query(collection(db, "chat_reports"), where("status", "==", "Pending"));
        const pendingReportsSnapshot = await getDocs(pendingReportsQuery);
        const pendingReports = pendingReportsSnapshot.size;

        setStats({
          totalUsers,
          activeUsersToday: null, // Placeholder - requires more complex tracking
          totalChatRooms,
          totalP2PChats,
          totalGroupChats,
          totalReports,
          pendingReports,
        });
      } catch (error) {
        console.error("Error fetching analytics data:", error);
        // Optionally set error state and display an error message
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [userProfile]);

  const statCards = [
    { title: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-500" },
    { title: "Total Chat Rooms", value: stats.totalChatRooms, icon: MessageCircle, color: "text-green-500" },
    { title: "P2P Chats", value: stats.totalP2PChats, icon: MessageCircle, color: "text-teal-500" },
    { title: "Group Chats", value: stats.totalGroupChats, icon: MessageCircle, color: "text-cyan-500" },
    { title: "Total Reports", value: stats.totalReports, icon: FileWarningIcon, color: "text-red-500" },
    { title: "Pending Reports", value: stats.pendingReports, icon: FileWarningIcon, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-center space-x-3">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Platform Analytics</h1>
            <p className="text-muted-foreground">Overview of key metrics for Hellohi.</p>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({length: 6}).map((_, index) => (
                <Card key={`skel-${index}`} className="shadow-lg">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-5 w-2/5" />
                        <Skeleton className="h-5 w-5 rounded-full" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-1/4 my-1" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                </Card>
            ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.title} className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {stat.value !== null ? stat.value : <Loader2 className="h-7 w-7 animate-spin" />}
                </div>
                {/* <p className="text-xs text-muted-foreground">Additional context if any</p> */}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
       <Card className="mt-8">
            <CardHeader>
                <CardTitle className="text-base">Advanced Analytics Note</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    This page provides basic counts. For more advanced analytics like "Active Users Today", real-time trends, or detailed engagement metrics,
                    a dedicated analytics solution (e.g., integrating Google Analytics for Firebase, or building custom data aggregation pipelines) would be required.
                </p>
            </CardContent>
        </Card>
    </div>
  );
}
