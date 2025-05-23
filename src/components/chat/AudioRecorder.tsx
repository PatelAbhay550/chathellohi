
'use client';

import { Button } from '@/components/ui/button';
import { Mic, StopCircle, Send, Trash2, AlertTriangle, Loader2, Play } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { ChatMessage } from '@/types';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AudioRecorderProps {
  chatId: string;
  currentUserId: string;
  onSendAudio: (fileDetails: { url: string; name: string; type: 'audio'; size: number }) => void;
  disabled?: boolean;
}

export default function AudioRecorder({ chatId, currentUserId, onSendAudio, disabled }: AudioRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); 
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);


  const requestPermission = useCallback(async () => {
    if (typeof navigator.mediaDevices === 'undefined' || !navigator.mediaDevices.getUserMedia) {
        toast({
            title: "Audio Recording Not Supported",
            description: "Your browser does not support audio recording.",
            variant: "destructive",
        });
        setPermissionStatus('denied'); // Treat as denied if API is unavailable
        return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setPermissionStatus('granted');
      return true;
    } catch (err) {
      console.error("Error getting microphone permission:", err);
      setPermissionStatus('denied');
      let description = "Please enable microphone access in your browser settings to record audio.";
      if (err instanceof Error && err.name === 'NotAllowedError') {
        description = "Microphone access was denied. Please enable it in your browser settings.";
      } else if (err instanceof Error && err.name === 'NotFoundError') {
        description = "No microphone found. Please connect a microphone and try again.";
      }
      toast({
        title: "Microphone Access Issue",
        description: description,
        variant: "destructive",
        duration: 7000,
      });
      return false;
    }
  }, [toast]);

  const startRecording = async () => {
    if (permissionStatus !== 'granted') {
      const hasPermission = await requestPermission();
      if (!hasPermission) return;
    }
    if (!audioStreamRef.current) {
        const hasPermissionAgain = await requestPermission(); // Re-try getting stream if null
        if(!hasPermissionAgain || !audioStreamRef.current){
            toast({title: "Error", description: "Microphone stream not available.", variant:"destructive"});
            return;
        }
    }

    setIsRecording(true);
    setAudioBlob(null); 
    setAudioUrl(null);
    audioChunksRef.current = [];

    const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4', 
        'audio/webm', 
    ];
    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';


    mediaRecorderRef.current = new MediaRecorder(audioStreamRef.current, { mimeType: supportedMimeType });
    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: supportedMimeType });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url); 
      setIsRecording(false); 
      // Do not stop tracks here yet, allow preview. Stop them in cleanup.
    };
    mediaRecorderRef.current.start();
    toast({ title: "Recording Started", description: "Tap the stop button when you're done."});
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false); 
  };

  const cleanUpStream = useCallback(() => {
      if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
      }
  }, []);

  const handleSendAudio = async () => {
    if (!audioBlob) return;
    setIsUploading(true);
    setUploadProgress(0);

    const fileExtension = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
    const audioFileName = `voice_message_${Date.now()}.${fileExtension}`;
    const fileRef = storageRef(storage, `chat_attachments/${chatId}/${currentUserId}/${audioFileName}`);
    const uploadTask = uploadBytesResumable(fileRef, audioBlob);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Audio upload failed:", error);
        toast({ title: 'Audio Upload Failed', description: error.message, variant: 'destructive' });
        setIsUploading(false);
        setUploadProgress(null);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          onSendAudio({
            url: downloadURL,
            name: audioFileName,
            type: 'audio',
            size: audioBlob.size,
          });
          toast({ title: "Audio Sent!"});
          handleDiscardAudio(true); // Pass true to indicate it was sent, so stream cleanup is appropriate
        } catch (error: any) {
          console.error("Failed to get audio download URL:", error);
          toast({ title: 'Send Failed', description: "Could not get audio URL.", variant: 'destructive' });
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
      }
    );
  };

  const handleDiscardAudio = (audioWasSent = false) => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl); 
      setAudioUrl(null);
    }
    audioChunksRef.current = [];
    if (!audioWasSent || (audioWasSent && mediaRecorderRef.current?.state === 'inactive')) {
        cleanUpStream(); 
    }
    // Only reset permission status if explicitly discarding before attempting to record,
    // or after a send operation. If denied, it stays denied.
    if (permissionStatus === 'granted' || permissionStatus === 'prompt') {
        setPermissionStatus('prompt');
    }
    setIsRecording(false);
  };
  
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      cleanUpStream();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [audioUrl, cleanUpStream]);


  if (permissionStatus === 'denied') {
    return (
      <Button variant="ghost" size="icon" disabled title="Microphone access denied. Please enable in browser settings.">
        <AlertTriangle className="h-5 w-5 text-destructive" />
      </Button>
    );
  }

  if (isUploading) {
    return (
      <div className="flex items-center space-x-2 h-10 px-2"> {/* Give it some height and padding */}
        <Loader2 className="h-5 w-5 animate-spin" />
        {uploadProgress !== null && <Progress value={uploadProgress} className="w-16 h-1.5" />}
      </div>
    );
  }

  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center space-x-1 h-10"> {/* Give it some height */}
        <audio ref={audioPreviewRef} src={audioUrl} controls className="h-8 max-w-[150px] sm:max-w-[200px] rounded-md" />
        <Button type="button" variant="ghost" size="icon" onClick={handleSendAudio} title="Send Audio" className="text-green-500 hover:text-green-600">
          <Send className="h-5 w-5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => handleDiscardAudio()} title="Discard Audio" className="text-destructive hover:text-destructive/80">
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled || (permissionStatus === 'prompt' && isRecording && !audioStreamRef.current)}
      title={isRecording ? "Stop Recording" : "Record Audio Message"}
      className={cn(isRecording ? "text-destructive animate-pulse" : "", "transition-colors")}
    >
      {isRecording ? <StopCircle className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
    </Button>
  );
}
