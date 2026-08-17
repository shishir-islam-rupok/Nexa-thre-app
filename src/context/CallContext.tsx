import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';

export interface CallData {
  state: CallState;
  callType: 'voice' | 'video';
  conversationId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar?: string;
  isCaller: boolean;
}

interface CallContextValue extends CallData {
  activeCall: CallData | null;
  startCall: (callType: 'voice' | 'video', conversationId: string, otherUserId: string, otherUserName: string, otherUserAvatar?: string) => void;
  receiveCall: (callType: 'voice' | 'video', conversationId: string, otherUserId: string, otherUserName: string, otherUserAvatar?: string) => void;
  acceptCall: () => void;
  endCall: () => void;
  setCallState: (state: CallState) => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

const idleData: CallData = {
  state: 'idle',
  callType: 'voice',
  conversationId: '',
  otherUserId: '',
  otherUserName: '',
  otherUserAvatar: undefined,
  isCaller: false,
};

export function CallProvider({ children }: { children: ReactNode }) {
  const callRef = useRef<CallData>(idleData);
  const [, setVersion] = useState(0);

  function update(data: Partial<CallData>) {
    callRef.current = { ...callRef.current, ...data };
    setVersion(v => v + 1);
  }

  function startCall(
    callType: 'voice' | 'video',
    conversationId: string,
    otherUserId: string,
    otherUserName: string,
    otherUserAvatar?: string
  ) {
    callRef.current = { state: 'outgoing', callType, conversationId, otherUserId, otherUserName, otherUserAvatar, isCaller: true };
    setVersion(v => v + 1);
  }

  function receiveCall(
    callType: 'voice' | 'video',
    conversationId: string,
    otherUserId: string,
    otherUserName: string,
    otherUserAvatar?: string
  ) {
    callRef.current = { state: 'incoming', callType, conversationId, otherUserId, otherUserName, otherUserAvatar, isCaller: false };
    setVersion(v => v + 1);
  }

  function acceptCall() {
    update({ state: 'connected' });
  }

  function endCall() {
    callRef.current = idleData;
    setVersion(v => v + 1);
  }

  function setCallState(state: CallState) {
    update({ state });
  }

  const activeCall: CallData | null = callRef.current.state !== 'idle' ? callRef.current : null;

  const value: CallContextValue = {
    ...callRef.current,
    activeCall,
    startCall,
    receiveCall,
    acceptCall,
    endCall,
    setCallState,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
