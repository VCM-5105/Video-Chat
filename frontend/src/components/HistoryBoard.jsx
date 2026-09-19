import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, Calendar, Clock, Send, Image as ImageIcon, 
  Smile, X, AlertCircle, Ban, ArrowLeft 
} from 'lucide-react';

const CURATED_GIFS = [
  { name: 'Popcorn', url: 'https://media.giphy.com/media/t3dL1FZZ0PDqM/giphy.gif', tags: 'popcorn eat funny laugh' },
  { name: 'Happy Dance', url: 'https://media.giphy.com/media/l3V0lsGtTMSB5YNgc/giphy.gif', tags: 'dance happy celebration joy' },
  { name: 'Mind Blown', url: 'https://media.giphy.com/media/2zqJKJ2BSExW0/giphy.gif', tags: 'mind blown wow space crazy' },
  { name: 'Facepalm', url: 'https://media.giphy.com/media/3xz2BLBOKhjKuDQd68/giphy.gif', tags: 'facepalm fail mistake sigh' },
  { name: 'Cat Wave', url: 'https://media.giphy.com/media/VOPK1B0SGPSXS/giphy.gif', tags: 'cat wave hello hi greet' },
  { name: 'Thumbs Up', url: 'https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif', tags: 'thumbs up yes ok good nice' },
  { name: 'Shrug', url: 'https://media.giphy.com/media/jPAdK8LY2Wv7TdlwOP/giphy.gif', tags: 'shrug don\'t know maybe what' },
  { name: 'Laughing', url: 'https://media.giphy.com/media/10yXFkBJ0MwIN2/giphy.gif', tags: 'laugh haha funny smile' },
  { name: 'Shocked', url: 'https://media.giphy.com/media/cl90q5wYv8lsQ/giphy.gif', tags: 'shocked omg surprise gasp' },
  { name: 'Sad Dog', url: 'https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif', tags: 'sad dog cry sorry emotional' },
  { name: 'Applaud', url: 'https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif', tags: 'clap applaud bravo cheer' },
  { name: 'Wink', url: 'https://media.giphy.com/media/12NUBkXghyw3W8/giphy.gif', tags: 'wink eye flirt fun' }
];

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryBoard({ socket, token, user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [activePartner, setActivePartner] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [presenceStatuses, setPresenceStatuses] = useState({});

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('https://video-chat-backend-c5ap.onrender.com/api/history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch history logs');
      
      setHistory(data);
      setError('');
      
      if (socket && data.length > 0) {
        const partnerIds = [...new Set(data.map(log => log.partner_id))];
        socket.emit('get-users-status', partnerIds, (statuses) => {
          setPresenceStatuses(statuses);
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, socket]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('https://video-chat-backend-c5ap.onrender.com/api/history', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (!ignore) {
          if (!res.ok) throw new Error(data.error || 'Failed to fetch history logs');
          setHistory(data);
          if (socket && data.length > 0) {
            const partnerIds = [...new Set(data.map(log => log.partner_id))];
            socket.emit('get-users-status', partnerIds, (statuses) => {
              if (!ignore) setPresenceStatuses(statuses);
            });
          }
        }
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [token, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleStatusChange = ({ userId, status }) => {
      setPresenceStatuses(prev => ({
        ...prev,
        [userId]: status
      }));
    };

    const handleIncomingDm = (msg) => {
      if (activePartner && msg.sender_id === activePartner.id) {
        setDmMessages(prev => [...prev, msg]);
      }
      fetchHistory();
    };

    const handleSentConfirmation = (msg) => {
      if (activePartner && msg.receiver_id === activePartner.id) {
        setDmMessages(prev => [...prev, msg]);
      }
    };

    socket.on('user-status-changed', handleStatusChange);
    socket.on('direct-message', handleIncomingDm);
    socket.on('direct-message-sent', handleSentConfirmation);

    return () => {
      socket.off('user-status-changed', handleStatusChange);
      socket.off('direct-message', handleIncomingDm);
      socket.off('direct-message-sent', handleSentConfirmation);
    };
  }, [socket, activePartner, fetchHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  const handleSelectPartner = async (partnerId, username, isBlocked) => {
    try {
      setActivePartner({
        id: partnerId,
        username,
        isBlocked: !!isBlocked
      });
      
      const res = await fetch(`https://video-chat-backend-c5ap.onrender.com/api/chat/${partnerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch messages');
      setDmMessages(data);
    } catch (err) {
      console.error(err);
      alert('Failed to load chat history.');
    }
  };

  const toggleBlockStatus = async () => {
    if (!activePartner) return;
    const isBlocking = !activePartner.isBlocked;
    const endpoint = isBlocking ? '/api/block' : '/api/unblock';
    
    try {
      const res = await fetch(`https://video-chat-backend-c5ap.onrender.com${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ blockedId: activePartner.id })
      });
      
      if (!res.ok) throw new Error('API failure');
      
      setActivePartner(prev => ({
        ...prev,
        isBlocked: isBlocking
      }));

      fetchHistory();
    } catch (err) {
      console.error(err);
      alert('Error updating block status.');
    }
  };

  const handleSendDm = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activePartner || !socket) return;

    socket.emit('send-direct-message', {
      receiverId: activePartner.id,
      content: inputText.trim(),
      type: 'text'
    });
    setInputText('');
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activePartner || !socket) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('https://video-chat-backend-c5ap.onrender.com/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload');

      socket.emit('send-direct-message', {
        receiverId: activePartner.id,
        content: data.url,
        type: 'image'
      });
    } catch (err) {
      console.error(err);
      alert('Error uploading image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const sendGif = (gifUrl) => {
    if (!activePartner || !socket) return;
    socket.emit('send-direct-message', {
      receiverId: activePartner.id,
      content: gifUrl,
      type: 'gif'
    });
    setShowGifPicker(false);
  };

  const filteredGifs = CURATED_GIFS.filter(gif => 
    gif.name.toLowerCase().includes(gifSearch.toLowerCase()) || 
    gif.tags.toLowerCase().includes(gifSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-120px)] w-full text-left">
      
      {/* LEFT PANEL: History Timeline */}
      <div className={`flex-1 lg:max-w-sm bg-[#14161b] rounded-xl flex flex-col border border-[#232731] overflow-hidden ${activePartner ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-3.5 border-b border-[#232731] bg-[#111317] flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            <span>Past Matches</span>
          </div>
          <button 
            onClick={fetchHistory}
            className="text-xs text-zinc-400 hover:text-zinc-200 font-medium cursor-pointer"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-6">
              <Calendar className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs font-medium text-zinc-400">No match history yet</p>
              <p className="text-[11px] mt-1 text-zinc-500">Start matching to meet people.</p>
            </div>
          ) : (
            history.map((log) => {
              const isPartnerOnline = presenceStatuses[log.partner_id] === 'online' || log.partner_status === 'online';
              const isBlocked = log.is_blocked_by_user === 1;

              return (
                <div 
                  key={log.id}
                  onClick={() => handleSelectPartner(log.partner_id, log.partner_name, isBlocked)}
                  className={`p-3 rounded-lg border transition cursor-pointer flex items-center justify-between gap-3 ${
                    activePartner?.id === log.partner_id 
                      ? 'bg-[#1c202a] border-[#2f3647]' 
                      : 'bg-[#111317] border-[#20242e] hover:bg-[#171920] hover:border-[#272c38]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full bg-[#1c2028] border border-[#292e3a] flex items-center justify-center font-medium text-zinc-300 capitalize text-xs select-none">
                        {log.partner_name.substring(0, 2)}
                      </div>
                      <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#14161b] ${
                        isBlocked ? 'bg-rose-500' : isPartnerOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}></span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs text-zinc-200 truncate">{log.partner_name}</span>
                        {isBlocked && (
                          <span className="px-1.5 py-0.2 bg-rose-500/10 text-rose-400 text-[10px] rounded border border-rose-500/20">Blocked</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5 select-none">
                        <span>{formatDate(log.started_at)}</span>
                        <span>•</span>
                        <span>{formatDuration(log.duration_seconds)}</span>
                      </div>
                    </div>
                  </div>

                  <MessageSquare className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Reconnection Messaging Board */}
      <div className={`flex-1 bg-[#14161b] rounded-xl flex flex-col border border-[#232731] overflow-hidden ${!activePartner ? 'hidden lg:flex' : 'flex'}`}>
        {activePartner ? (
          <>
            {/* DM Header */}
            <div className="p-3 border-b border-[#232731] bg-[#111317] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <button 
                  onClick={() => setActivePartner(null)}
                  className="p-1 rounded text-zinc-400 hover:bg-[#1e222b] lg:hidden cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div className="relative select-none">
                  <div className="w-8 h-8 rounded-full bg-[#1c2028] border border-[#292e3a] flex items-center justify-center font-medium text-zinc-300 capitalize text-xs">
                    {activePartner.username.substring(0, 2)}
                  </div>
                  <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#111317] ${
                    activePartner.isBlocked ? 'bg-rose-500' : presenceStatuses[activePartner.id] === 'online' ? 'bg-emerald-500' : 'bg-zinc-600'
                  }`}></span>
                </div>

                <div>
                  <h3 className="font-medium text-xs text-zinc-100">{activePartner.username}</h3>
                  <p className="text-[10px] text-zinc-500 select-none">
                    {activePartner.isBlocked 
                      ? 'Blocked' 
                      : presenceStatuses[activePartner.id] === 'online' 
                        ? 'Online' 
                        : 'Offline'}
                  </p>
                </div>
              </div>

              <button 
                onClick={toggleBlockStatus}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                  activePartner.isBlocked 
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{activePartner.isBlocked ? 'Unblock' : 'Block'}</span>
              </button>
            </div>

            {/* DMs View Area */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#0f1115]">
              {dmMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-6 select-none">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-25" />
                  <p className="text-xs font-medium text-zinc-400">Direct Messages</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Send a message to reconnect with {activePartner.username}.</p>
                </div>
              ) : (
                dmMessages.map((msg) => {
                  const isSelf = msg.sender_id === user.id;
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col max-w-[75%] ${isSelf ? 'ml-auto items-end' : 'mr-auto items-start'} animate-fade-in`}
                    >
                      <div className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                        isSelf 
                          ? 'bg-[#222733] text-zinc-100 border border-[#303746] rounded-tr-none' 
                          : 'bg-[#191c22] text-zinc-200 border border-[#262b35] rounded-tl-none'
                      }`}>
                        {msg.message_type === 'text' && (
                          <p className="break-all whitespace-pre-wrap">{msg.content}</p>
                        )}
                        {msg.message_type === 'image' && (
                          <a href={msg.content} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-[#262b35] hover:opacity-90">
                            <img src={msg.content} alt="Attachment" className="max-w-44 max-h-36 object-cover" />
                          </a>
                        )}
                        {msg.message_type === 'gif' && (
                          <div className="overflow-hidden rounded border border-[#262b35]">
                            <img src={msg.content} alt="GIF" className="max-w-44 max-h-36 object-cover" />
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-zinc-500 mt-1 px-1">{formatDate(msg.sent_at)}</span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendDm} className="p-2.5 border-t border-[#232731] bg-[#111317] flex flex-col gap-2 relative">
              
              {showGifPicker && (
                <div className="absolute bottom-14 left-2 right-2 bg-[#161820] border border-[#272b36] rounded-xl p-3 shadow-xl flex flex-col z-20 h-60 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-300">Reaction GIF</span>
                    <button 
                      type="button" 
                      onClick={() => setShowGifPicker(false)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#20242e] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input 
                    type="text" 
                    placeholder="Search GIFs..."
                    value={gifSearch}
                    onChange={(e) => setGifSearch(e.target.value)}
                    className="w-full py-1.5 px-2.5 bg-[#0e1013] border border-[#262b35] rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 mb-2"
                  />

                  <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-1.5">
                    {filteredGifs.map((gif, idx) => (
                      <button 
                        key={idx}
                        type="button"
                        onClick={() => sendGif(gif.url)}
                        className="overflow-hidden rounded border border-[#262b35] hover:border-zinc-400 transition cursor-pointer h-14 bg-black flex items-center justify-center"
                      >
                        <img src={gif.url} alt={gif.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activePartner.isBlocked ? (
                <div className="p-2.5 text-center rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>This user is blocked. Unblock them to send messages.</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <button 
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 active:scale-95 transition hover:bg-[#1c1f28] cursor-pointer shrink-0"
                    title="Send Image"
                  >
                    {uploadingImage ? (
                      <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin"></div>
                    ) : (
                      <ImageIcon className="w-4 h-4" />
                    )}
                  </button>

                  <button 
                    type="button" 
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 active:scale-95 transition hover:bg-[#1c1f28] cursor-pointer shrink-0"
                    title="Send GIF"
                  >
                    <Smile className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 py-1.5 px-3 bg-[#0e1013] border border-[#262b35] rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 text-xs"
                  />

                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="p-2 rounded-lg bg-zinc-100 hover:bg-white disabled:bg-[#1a1d24] disabled:text-zinc-600 text-zinc-900 transition active:scale-95 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-6 select-none">
            <MessageSquare className="w-8 h-8 mb-2 opacity-25" />
            <p className="text-xs font-medium text-zinc-400">Direct Messages</p>
            <p className="text-[11px] text-zinc-500 mt-0.5 max-w-xs leading-relaxed">
              Select a previous match from the left to view transcripts or continue the conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
