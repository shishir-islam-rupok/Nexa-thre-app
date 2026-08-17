import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useCall } from '@/context/CallContext';
import { useToast } from '@/components/ui/Toast';
import type { Conversation, Message, Profile } from '@/types';
import Avatar from '@/components/ui/Avatar';
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
import { formatTime, timeAgo } from '@/lib/format';
import {
  Phone, Video, Send, Search, ArrowLeft, MessageCircle, Plus,
  Smile, Reply, Edit2, Trash2, Check, CheckCheck, Paperclip,
  Loader2, Download,
} from 'lucide-react';
import { uploadFile } from '@/lib/upload';

interface MessagesPageProps {
  onViewProfile: (userId: string) => void;
}

interface ConvWithOther extends Conversation {
  otherUser: Profile;
}

export default function MessagesPage({ onViewProfile }: MessagesPageProps) {
  const { profile } = useAuth();
  const { startCall } = useCall();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<ConvWithOther[]>([]);
  const [activeConv, setActiveConv] = useState<ConvWithOther | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [msgSearch, setMsgSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmoji, setShowEmoji] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: parts } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', profile.id);
    if (!parts || parts.length === 0) { setConversations([]); setLoading(false); return; }

    const convIds = parts.map((p) => p.conversation_id);
    const [allPartsRes, lastMsgsRes] = await Promise.all([
      supabase.from('conversation_participants').select('conversation_id, user_id, profiles!user_id(*)').in('conversation_id', convIds).neq('user_id', profile.id),
      supabase.from('messages').select('conversation_id, content, sender_id, created_at, read_at').in('conversation_id', convIds).order('created_at', { ascending: false }),
    ]);

    const otherUserMap: Record<string, Profile> = {};
    (allPartsRes.data || []).forEach((p) => { otherUserMap[p.conversation_id] = (p as Record<string, unknown>).profiles as unknown as Profile; });
    const lastMsgMap: Record<string, Message> = {};
    const unreadMap: Record<string, number> = {};
    (lastMsgsRes.data || []).forEach((m) => {
      if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m as Message;
      if (m.read_at === null && m.sender_id !== profile.id) {
        unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
      }
    });

    const convs: ConvWithOther[] = convIds
      .map((cid): ConvWithOther | null => {
        const otherUser = otherUserMap[cid];
        if (!otherUser) return null;
        return { id: cid, created_at: '', other_user: otherUser, otherUser, last_message: lastMsgMap[cid], unread_count: unreadMap[cid] || 0 };
      })
      .filter((c): c is ConvWithOther => c !== null)
      .sort((a, b) => (b.last_message?.created_at || '').localeCompare(a.last_message?.created_at || ''));

    setConversations(convs);
    setLoading(false);
  }, [profile]);

  const loadMessages = useCallback(async (convId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (error) {
      showToast('Failed to load messages.', 'error');
      return;
    }
    setMessages((data || []) as Message[]);
  }, [showToast]);

  const appendMessage = useCallback((message: Message) => {
    setMessages((previous) => previous.some((item) => item.id === message.id)
      ? previous
      : [...previous, message]);
  }, []);

  const markAsRead = useCallback(async (convId: string) => {
    const { error } = await supabase.rpc('mark_conversation_read', {
      target_conversation_id: convId,
    });
    if (error) console.error('Failed to mark messages as read:', error);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as Message;
        if (activeConv && newMsg.conversation_id === activeConv.id) {
          appendMessage(newMsg);
          markAsRead(activeConv.id);
        }
        loadConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => loadConversations())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
        if (activeConv) loadMessages(activeConv.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConv, appendMessage, loadConversations, loadMessages, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeConv) { loadMessages(activeConv.id); markAsRead(activeConv.id); }
  }, [activeConv, loadMessages, markAsRead]);

  async function sendMessage() {
    if (!input.trim() || !activeConv || !profile || sendingMessage) return;
    const text = input.trim();
    setSendingMessage(true);
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: activeConv.id, sender_id: profile.id, content: text })
      .select()
      .single();
    setSendingMessage(false);

    if (error || !data) {
      showToast(error?.message || 'Failed to send message.', 'error');
      return;
    }

    setInput('');
    setReplyTo(null);
    appendMessage(data as Message);
    loadConversations();
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConv || !profile || uploadingAttachment) return;
    setUploadingAttachment(true);
    const result = await uploadFile(file, 'uploads');
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: activeConv.id, sender_id: profile.id, content: '', attachment_url: result.url })
        .select()
        .single();
      if (error || !data) {
        showToast(error?.message || 'Failed to send attachment.', 'error');
      } else {
        appendMessage(data as Message);
        loadConversations();
      }
    }
    e.target.value = '';
    setUploadingAttachment(false);
  }

  async function editMessage(msgId: string) {
    if (!editText.trim()) return;
    const { error } = await supabase.from('messages').update({ content: editText.trim() }).eq('id', msgId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: editText.trim() } : m));
    setEditingId(null);
    setEditText('');
  }

  async function deleteMessage(msgId: string) {
    const { error } = await supabase.from('messages').delete().eq('id', msgId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    loadConversations();
  }

  async function reactToMessage(msgId: string, emoji: string) {
    if (!profile) return;
    const { error } = await supabase.from('message_reactions').insert({ message_id: msgId, user_id: profile.id, emoji });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setShowEmoji(null);
  }

  async function startNewChat(otherUser: Profile) {
    if (!profile || creatingConversation) return;
    setCreatingConversation(true);
    const { data, error } = await supabase
      .rpc('get_or_create_direct_conversation', { other_user_id: otherUser.id })
      .single();
    setCreatingConversation(false);

    if (error || !data) {
      showToast(error?.message || 'Failed to start conversation.', 'error');
      return;
    }

    const conversation = data as Pick<Conversation, 'id' | 'created_at'>;
    setActiveConv({ id: conversation.id, created_at: conversation.created_at, otherUser, other_user: otherUser });
    setShowNewChat(false);
    loadConversations();
  }

  useEffect(() => {
    if (showNewChat) {
      supabase.from('profiles').select('*').neq('id', profile?.id || '').then(({ data }) => setAllUsers((data || []) as Profile[]));
    }
  }, [showNewChat, profile]);

  const filteredConvs = conversations.filter((c) =>
    c.otherUser.full_name.toLowerCase().includes(msgSearch.toLowerCase()) ||
    c.otherUser.username.toLowerCase().includes(msgSearch.toLowerCase())
  );

  if (!profile) return null;

  return (
    <div className="h-full flex">
      {/* Conversation list */}
      <div className={`${activeConv ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800`}>
        <div className="px-4 py-4 border-b border-ink-200 dark:border-ink-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-ink-900 dark:text-white">Messages</h1>
            <IconButton onClick={() => setShowNewChat(true)}><Plus /></IconButton>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="text"
              value={msgSearch}
              onChange={(e) => setMsgSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full h-9 pl-9 pr-4 bg-ink-100 dark:bg-ink-800 border-0 rounded-lg text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-ink-200 dark:bg-ink-700" />
                <div className="flex-1 space-y-2"><div className="h-3 w-24 bg-ink-200 dark:bg-ink-700 rounded" /><div className="h-3 w-40 bg-ink-200 dark:bg-ink-700 rounded" /></div>
              </div>)}
            </div>
          ) : filteredConvs.length === 0 ? (
            <EmptyState icon={<MessageCircle className="w-7 h-7" />} title="No conversations yet" description="Start a new chat to connect with people." />
          ) : (
            filteredConvs.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`w-full flex items-center gap-3 p-3 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors text-left ${activeConv?.id === conv.id ? 'bg-ink-50 dark:bg-ink-800' : ''}`}
              >
                <Avatar name={conv.otherUser.full_name} src={conv.otherUser.avatar_url || undefined} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">{conv.otherUser.full_name}</p>
                    {conv.last_message && <span className="text-xs text-ink-400 shrink-0 ml-2">{timeAgo(conv.last_message.created_at)}</span>}
                  </div>
                  <p className="text-xs text-ink-400 truncate mt-0.5">
                    {conv.last_message ? (conv.last_message.sender_id === profile.id ? 'You: ' : '') + conv.last_message.content : 'No messages yet'}
                  </p>
                </div>
                {(conv.unread_count || 0) > 0 && (
                  <span className="w-5 h-5 bg-accent-600 text-white text-[10px] font-semibold rounded-full flex items-center justify-center shrink-0">{conv.unread_count}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      {activeConv ? (
        <div className="flex-1 flex flex-col bg-ink-50 dark:bg-ink-950">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
            <IconButton className="md:hidden" onClick={() => setActiveConv(null)}><ArrowLeft /></IconButton>
            <button onClick={() => onViewProfile(activeConv.otherUser.id)} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar name={activeConv.otherUser.full_name} src={activeConv.otherUser.avatar_url || undefined} size={36} />
              <div className="text-left">
                <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{activeConv.otherUser.full_name}</p>
                <p className="text-xs text-emerald-500">Active now</p>
              </div>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <IconButton onClick={() => startCall('voice', activeConv.id, activeConv.otherUser.id, activeConv.otherUser.full_name, activeConv.otherUser.avatar_url || undefined)}><Phone /></IconButton>
              <IconButton onClick={() => startCall('video', activeConv.id, activeConv.otherUser.id, activeConv.otherUser.full_name, activeConv.otherUser.avatar_url || undefined)}><Video /></IconButton>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2">
            {messages.length === 0 ? (
              <EmptyState icon={<MessageCircle className="w-7 h-7" />} title="No messages yet" description="Send a message to start the conversation." />
            ) : (
              messages.map((msg, i) => {
                const isMe = msg.sender_id === profile.id;
                const showAvatar = !isMe && (i === 0 || messages[i - 1].sender_id !== msg.sender_id);
                const prevMsg = messages[i - 1];
                const isSameSender = prevMsg && prevMsg.sender_id === msg.sender_id && new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 60000;
                return (
                  <div key={msg.id} className={`flex gap-2 ${isMe ? 'justify-end' : ''} ${isSameSender ? 'mt-0.5' : 'mt-2'}`}>
                    {!isMe && (showAvatar ? (
                      <Avatar name={activeConv.otherUser.full_name} src={activeConv.otherUser.avatar_url || undefined} size={28} className="mt-auto" />
                    ) : <div className="w-7 shrink-0" />)}
                    <div className={`group relative max-w-[70%] ${isMe ? 'items-end' : ''}`}>
                      {editingId === msg.id ? (
                        <div className="flex items-center gap-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl px-3 py-2">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && editMessage(msg.id)}
                            autoFocus
                            className="text-sm bg-transparent text-ink-800 dark:text-ink-100 focus:outline-none flex-1"
                          />
                          <button onClick={() => editMessage(msg.id)} className="text-accent-500"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingId(null)} className="text-ink-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-sm ${
                            isMe
                              ? 'bg-accent-600 text-white rounded-br-md'
                              : 'bg-white dark:bg-ink-900 text-ink-800 dark:text-ink-100 border border-ink-200 dark:border-ink-800 rounded-bl-md'
                          }`}
                        >
                          {replyTo?.id === msg.id && (
                            <div className={`text-xs mb-1 pb-1 border-b ${isMe ? 'border-white/20 text-white/70' : 'border-ink-200 dark:border-ink-700 text-ink-400'}`}>
                              Replying to message
                            </div>
                          )}
                          {msg.content && <p>{msg.content}</p>}
                          {msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noreferrer" className={`mt-1 flex items-center gap-2 text-xs underline ${isMe ? 'text-white/80' : 'text-accent-600 dark:text-accent-400'}`}>
                              <Download className="w-3.5 h-3.5" /> Attachment
                            </a>
                          )}
                        </div>
                      )}
                      <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : ''}`}>
                        <span className="text-[10px] text-ink-400">{formatTime(msg.created_at)}</span>
                        {isMe && (msg.read_at ? <CheckCheck className="w-3 h-3 text-accent-500" /> : <Check className="w-3 h-3 text-ink-400" />)}
                      </div>
                      {/* Hover actions */}
                      {editingId !== msg.id && (
                        <div className={`absolute top-0 ${isMe ? 'right-full mr-1' : 'left-full ml-1'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                          <div className="flex items-center gap-0.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-lg shadow-sm p-0.5">
                            <button onClick={() => setShowEmoji(showEmoji === msg.id ? null : msg.id)} className="p-1 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-400">
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setReplyTo(msg)} className="p-1 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-400">
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            {isMe && (
                              <>
                                <button onClick={() => { setEditingId(msg.id); setEditText(msg.content); }} className="p-1 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-400">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteMessage(msg.id)} className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-400">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                          {showEmoji === msg.id && (
                            <div className="absolute top-full mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-lg p-2 flex gap-1 z-10">
                              {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => (
                                <button key={emoji} onClick={() => reactToMessage(msg.id, emoji)} className="text-lg hover:scale-125 transition-transform">{emoji}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply indicator */}
          {replyTo && (
            <div className="px-4 py-2 bg-ink-100 dark:bg-ink-800 border-t border-ink-200 dark:border-ink-700 flex items-center justify-between">
              <span className="text-xs text-ink-500 truncate">Replying to: {replyTo.content}</span>
              <button onClick={() => setReplyTo(null)} className="text-ink-400 hover:text-ink-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}

          {/* Composer */}
          <div className="px-4 py-3 border-t border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 flex items-center gap-2">
            <label className="p-2 rounded-lg text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors cursor-pointer">
              {uploadingAttachment ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
              <input type="file" className="hidden" onChange={handleAttachmentUpload} disabled={uploadingAttachment} />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 h-10 px-4 bg-ink-100 dark:bg-ink-800 border-0 rounded-full text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sendingMessage}
              className="w-10 h-10 rounded-full bg-accent-600 text-white flex items-center justify-center hover:bg-accent-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-ink-50 dark:bg-ink-950">
          <EmptyState icon={<MessageCircle className="w-7 h-7" />} title="Select a conversation" description="Choose a conversation from the list to start chatting." />
        </div>
      )}

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4 animate-fade-in" onClick={() => setShowNewChat(false)}>
          <div className="w-full max-w-md bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-800 shadow-xl animate-slide-up overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-ink-200 dark:border-ink-800">
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">New Message</h2>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people..."
                  disabled={creatingConversation}
                  className="w-full h-10 pl-9 pr-4 bg-ink-100 dark:bg-ink-800 border-0 rounded-lg text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                />
              </div>
              <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1">
                {allUsers.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())).map((user) => (
                  <button key={user.id} onClick={() => startNewChat(user)} disabled={creatingConversation} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors text-left disabled:opacity-50">
                    <Avatar name={user.full_name} src={user.avatar_url || undefined} size={40} />
                    <div>
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{user.full_name}</p>
                      <p className="text-xs text-ink-400">@{user.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
