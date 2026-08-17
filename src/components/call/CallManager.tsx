import { useEffect, useRef, useState } from 'react';
import { useCall } from '@/context/CallContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import { formatDuration } from '@/lib/format';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, PhoneCall } from 'lucide-react';

const CALL_CHANNEL = 'nexa-webrtc-signaling';

type Signal = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'end-call';
  from?: string;
  to?: string;
  conversationId?: string;
  callType?: 'voice' | 'video';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  callerName?: string;
  callerAvatar?: string;
};

export default function CallManager() {
  const { activeCall, endCall, acceptCall, setCallState, receiveCall } = useCall();
  const { profile } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef(activeCall);
  const pendingOfferRef = useRef<Signal | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState('');
  const callStartRef = useRef(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  function sendSignal(signal: Signal) {
    void supabase.channel(CALL_CHANNEL).send({ type: 'broadcast', event: 'signal', payload: signal });
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      const call = activeCallRef.current;
      if (event.candidate && call && profile) {
        sendSignal({ type: 'ice-candidate', from: profile.id, to: call.otherUserId, conversationId: call.conversationId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (remoteVideoRef.current && stream) remoteVideoRef.current.srcObject = stream;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        startDurationTimer();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanup(false);
      }
    };

    return pc;
  }

  async function startMedia(callType: 'voice' | 'video') {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
    localStreamRef.current = stream;
    if (localVideoRef.current && callType === 'video') localVideoRef.current.srcObject = stream;
    return stream;
  }

  async function initiateCall() {
    const call = activeCallRef.current;
    if (!call || !profile || peerRef.current) return;
    try {
      const stream = await startMedia(call.callType);
      const pc = createPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: pc.localDescription || undefined, from: profile.id, to: call.otherUserId, conversationId: call.conversationId, callType: call.callType, callerName: profile.full_name, callerAvatar: profile.avatar_url || undefined });
    } catch {
      setError('Camera/microphone access failed. Please allow browser permissions.');
      window.setTimeout(() => cleanup(true), 2500);
    }
  }

  async function acceptIncomingCall() {
    const call = activeCallRef.current;
    const offer = pendingOfferRef.current;
    if (!call || !offer || !profile) return;
    try {
      const stream = await startMedia(call.callType);
      const pc = createPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp!));
      for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: 'answer', sdp: pc.localDescription || undefined, from: profile.id, to: offer.from, conversationId: offer.conversationId });
      pendingOfferRef.current = null;
      acceptCall();
    } catch {
      setError('Could not start the call. Check camera/microphone permissions.');
      cleanup(true);
    }
  }

  async function handleSignal(signal: Signal) {
    if (!profile || signal.to !== profile.id) return;
    const call = activeCallRef.current;
    if (signal.type === 'offer') {
      if (!call) {
        pendingOfferRef.current = signal;
        receiveCall(signal.callType || 'voice', signal.conversationId || '', signal.from || '', signal.callerName || 'Unknown', signal.callerAvatar);
      }
      return;
    }
    if (!call || signal.conversationId !== call.conversationId) return;

    if (signal.type === 'answer' && peerRef.current && signal.sdp) {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      for (const candidate of pendingCandidatesRef.current) await peerRef.current.addIceCandidate(candidate);
      pendingCandidatesRef.current = [];
      setCallState('connected');
      startDurationTimer();
    } else if (signal.type === 'ice-candidate' && signal.candidate) {
      if (peerRef.current?.remoteDescription) {
        try { await peerRef.current.addIceCandidate(signal.candidate); } catch { /* ignore stale candidate */ }
      } else {
        pendingCandidatesRef.current.push(signal.candidate);
      }
    } else if (signal.type === 'end-call') {
      cleanup(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(CALL_CHANNEL, { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => { void handleSignal(payload as Signal); });
    void channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile?.id]);

  useEffect(() => {
    if (activeCall?.state === 'outgoing' && activeCall.isCaller) void initiateCall();
  }, [activeCall?.state, activeCall?.conversationId]);

  function startDurationTimer() {
    if (durationTimerRef.current) return;
    callStartRef.current = callStartRef.current || Date.now();
    durationTimerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
  }

  function cleanup(notifyRemote: boolean) {
    const call = activeCallRef.current;
    if (notifyRemote && call && profile) sendSignal({ type: 'end-call', from: profile.id, to: call.otherUserId, conversationId: call.conversationId });
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    callStartRef.current = 0;
    setDuration(0);
    setMuted(false);
    setVideoOff(false);
    setError('');
    endCall();
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  function toggleVideo() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoOff(!track.enabled);
  }

  if (!activeCall || activeCall.state === 'idle') return null;
  const isVideo = activeCall.callType === 'video';

  if (activeCall.state === 'incoming') {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6">
          <p className="text-sky-400 text-sm font-medium">Incoming {isVideo ? 'Video' : 'Voice'} Call</p>
          <Avatar name={activeCall.otherUserName} src={activeCall.otherUserAvatar || undefined} size={120} className="ring-4 ring-white/10" />
          <h2 className="text-2xl font-bold text-white">{activeCall.otherUserName}</h2>
          <div className="flex items-center gap-6">
            <button onClick={() => cleanup(true)} className="flex flex-col items-center gap-2"><div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center"><PhoneOff className="w-7 h-7 text-white" /></div><span className="text-xs text-slate-400">Decline</span></button>
            <button onClick={() => void acceptIncomingCall()} className="flex flex-col items-center gap-2"><div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center animate-pulse"><PhoneCall className="w-7 h-7 text-white" /></div><span className="text-xs text-slate-400">Accept</span></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-between p-6">
      <div className="text-center pt-8"><h2 className="text-xl font-bold text-white">{activeCall.otherUserName}</h2><p className="text-sky-400 text-sm mt-1">{activeCall.state === 'outgoing' ? 'Calling...' : formatDuration(duration)}</p>{error && <p className="text-rose-400 text-sm mt-2">{error}</p>}</div>
      <div className="flex-1 flex items-center justify-center w-full max-w-3xl relative">
        {isVideo ? <><video ref={remoteVideoRef} autoPlay playsInline className="w-full max-h-[60vh] rounded-2xl object-cover bg-black/40" /><video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-0 right-0 w-32 h-44 md:w-40 md:h-52 rounded-xl object-cover border-2 border-white/10 shadow-lg" /></> : <div className="flex flex-col items-center gap-4"><Avatar name={activeCall.otherUserName} src={activeCall.otherUserAvatar || undefined} size={140} /><span className="text-slate-300 text-sm">{activeCall.state === 'outgoing' ? 'Connecting...' : 'Voice call'}</span></div>}
      </div>
      <div className="flex items-center gap-3 pb-8">
        <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center ${muted ? 'bg-white text-slate-800' : 'bg-white/10 text-white'}`}>{muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}</button>
        {isVideo && <button onClick={toggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center ${videoOff ? 'bg-white text-slate-800' : 'bg-white/10 text-white'}`}>{videoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}</button>}
        <button onClick={() => cleanup(true)} className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center"><Phone className="w-6 h-6 text-white rotate-[135deg]" /></button>
      </div>
    </div>
  );
}
