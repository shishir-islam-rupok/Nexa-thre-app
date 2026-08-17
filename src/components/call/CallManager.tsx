import { useEffect, useRef, useState } from 'react';
import { useCall } from '@/context/CallContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import { formatDuration } from '@/lib/format';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, PhoneCall } from 'lucide-react';

const CALL_CHANNEL = 'webrtc-signaling';

export default function CallManager() {
  const { activeCall, endCall, acceptCall, setCallState, receiveCall } = useCall();
  const { profile } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState('');
  const callStartRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && activeCall) {
        sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate,
          from: profile?.id,
          to: activeCall.otherUserId,
          conversationId: activeCall.conversationId,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanup();
      }
    };

    return pc;
  }

  function sendSignal(data: Record<string, unknown>) {
    supabase.channel(CALL_CHANNEL).send({
      type: 'broadcast',
      event: 'signal',
      payload: data,
    });
  }

  async function startMedia(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: activeCall?.callType === 'video',
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current && activeCall?.callType === 'video') {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }

  async function initiateCall() {
    try {
      const stream = await startMedia();
      const pc = createPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({
        type: 'offer',
        sdp: pc.localDescription,
        from: profile?.id,
        to: activeCall?.otherUserId,
        conversationId: activeCall?.conversationId,
        callType: activeCall?.callType,
        callerName: profile?.full_name,
        callerAvatar: profile?.avatar_url,
      });
    } catch {
      setError('Could not access camera/microphone. Please check permissions.');
      setTimeout(() => cleanup(), 3000);
    }
  }

  async function acceptIncomingCall() {
    try {
      const stream = await startMedia();
      const pc = createPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      acceptCall();
    } catch {
      setError('Could not access camera/microphone. Please check permissions.');
      setTimeout(() => cleanup(), 3000);
    }
  }

  function cleanup() {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setDuration(0);
    setError('');
    endCall();
  }

  // Global signaling listener — always active, picks up incoming calls
  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel(CALL_CHANNEL, {
      config: { broadcast: { self: false } },
    });

    channelRef.current = channel;

    channel.on('broadcast', { event: 'signal' }, (msg: { payload: Record<string, unknown> }) => {
      const payload = msg.payload;
      if (payload.to !== profile.id) return;

      if (payload.type === 'offer' && !activeCall) {
        receiveCall(
          (payload.callType as 'voice' | 'video') || 'voice',
          payload.conversationId as string,
          payload.from as string,
          (payload.callerName as string) || 'Unknown',
          payload.callerAvatar as string | undefined,
        );
      }
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Active call signaling — handles offer/answer/ICE when a call is in progress
  useEffect(() => {
    if (!activeCall || activeCall.state === 'idle' || !profile) return;

    const channel = supabase.channel(`${CALL_CHANNEL}-${activeCall.conversationId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'signal' }, (msg: { payload: Record<string, unknown> }) => {
      const payload = msg.payload;
      if (payload.to !== profile.id) return;
      if (payload.conversationId !== activeCall.conversationId) return;
      handleSignal(payload);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && activeCall.isCaller && activeCall.state === 'outgoing') {
        await initiateCall();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.state, activeCall?.conversationId, profile]);

  async function handleSignal(payload: Record<string, unknown>) {
    const pc = peerRef.current;

    if (payload.type === 'offer') {
      if (!pc) {
        const newPc = createPeerConnection();
        peerRef.current = newPc;
        try {
          const stream = await startMedia();
          stream.getTracks().forEach(track => newPc.addTrack(track, stream));
          await newPc.setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit));
          const answer = await newPc.createAnswer();
          await newPc.setLocalDescription(answer);
          sendSignal({
            type: 'answer',
            sdp: newPc.localDescription,
            from: profile?.id,
            to: payload.from,
            conversationId: payload.conversationId,
          });
          callStartRef.current = Date.now();
          startDurationTimer();
        } catch {
          setError('Could not access camera/microphone.');
        }
      }
    } else if (payload.type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit));
      callStartRef.current = Date.now();
      startDurationTimer();
      setCallState('connected');
    } else if (payload.type === 'ice-candidate' && pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate as RTCIceCandidateInit));
      } catch {
        // candidate may arrive before remote description
      }
    } else if (payload.type === 'end-call') {
      cleanup();
    }
  }

  function startDurationTimer() {
    if (durationTimerRef.current) return;
    durationTimerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
  }

  function toggleMute() {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !t.enabled;
        setMuted(!t.enabled);
      });
    }
  }

  function toggleVideo() {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = !t.enabled;
        setVideoOff(!t.enabled);
      });
    }
  }

  function handleEndCall() {
    if (activeCall) {
      sendSignal({
        type: 'end-call',
        from: profile?.id,
        to: activeCall.otherUserId,
        conversationId: activeCall.conversationId,
      });
    }
    cleanup();
  }

  if (!activeCall || activeCall.state === 'idle') return null;

  const isVideo = activeCall.callType === 'video';

  // Incoming call screen
  if (activeCall.state === 'incoming') {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <p className="text-sky-400 text-sm font-medium mb-4">Incoming {isVideo ? 'Video' : 'Voice'} Call</p>
            <Avatar name={activeCall.otherUserName} src={activeCall.otherUserAvatar || undefined} size={120} className="ring-4 ring-white/10" />
            <h2 className="text-2xl font-bold text-white mt-6">{activeCall.otherUserName}</h2>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={handleEndCall} className="flex flex-col items-center gap-2 group">
              <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center group-hover:bg-rose-400 transition-colors shadow-lg shadow-rose-500/30">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs text-slate-400">Decline</span>
            </button>
            <button onClick={acceptIncomingCall} className="flex flex-col items-center gap-2 group">
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center group-hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/30 animate-pulse">
                <PhoneCall className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs text-slate-400">Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Outgoing / connected call screen
  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-between p-6">
      <div className="text-center pt-8">
        <h2 className="text-xl font-bold text-white">{activeCall.otherUserName}</h2>
        <p className="text-sky-400 text-sm mt-1">
          {activeCall.state === 'outgoing' ? 'Calling...' : formatDuration(duration)}
        </p>
        {error && <p className="text-rose-400 text-sm mt-2">{error}</p>}
      </div>

      <div className="flex-1 flex items-center justify-center w-full max-w-3xl relative">
        {isVideo ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full max-h-[60vh] rounded-2xl object-cover bg-black/40" />
            <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-0 right-0 w-32 h-44 md:w-40 md:h-52 rounded-xl object-cover border-2 border-white/10 shadow-lg" />
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Avatar name={activeCall.otherUserName} src={activeCall.otherUserAvatar || undefined} size={140} className="ring-4 ring-white/10" />
            {activeCall.state === 'outgoing' && (
              <span className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pb-8">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            muted ? 'bg-white text-slate-800' : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        {isVideo && (
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              videoOff ? 'bg-white text-slate-800' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {videoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
        )}
        <button
          onClick={handleEndCall}
          className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center hover:bg-rose-400 transition-colors shadow-lg shadow-rose-500/30"
        >
          <Phone className="w-6 h-6 text-white rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
