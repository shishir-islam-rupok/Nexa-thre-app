import { useCallback, useEffect, useRef, useState } from 'react';
import { useCall } from '@/context/CallContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import { formatDuration } from '@/lib/format';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, PhoneCall } from 'lucide-react';

const CALL_CHANNEL = 'nexa-webrtc-signaling';

type SignalPayload = {
 