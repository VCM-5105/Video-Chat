import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Calendar, Clock, Send, Image as ImageIcon, 
  Smile, UserCheck, ShieldAlert, X, AlertCircle, Ban, ArrowLeft 
} from 'lucide-react';

// Curated GIF list for DM (same fallback collection)
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

export default function HistoryBoard({ socket, token, user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Active chat state
  const [activePartner, setActivePartner] = useState(null); // partner object: { id, username, isBlocked, status }
  const [dmMessages, setDmMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [presenceStatuses, setPresenceStatuses] = useState({}); // userId -> 'online' | 'offline'

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch History Logs
  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('https://video-chat-backend-c5ap.onrender.com/api/history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch history logs');
      
      setHistory(data);
      
      // Request active presence for all partners from socket
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
  };

  useEffect(() => {
    fetchHistory();
  }, [token]);

  // Listen to presence updates from socket
  useEffect(() => {
    if (!socket) return;

    const handleStatusChange = ({ userId, status }) => {
      setPresenceStatuses(prev => ({
        ...prev,
        [userId]: status
      }));
    };

    const handleIncomingDm = (msg) => {
      // If we are currently chatting with this sender, push to conversation messages
      if (activePartner && msg.sender_id === activePartner.id) {
        setDmMessages(prev => [...prev, msg]);
      }
      // Refresh timeline list to bubble things up if necessary
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
  }, [socket, activePartner]);

  // Scroll to bottom on DM update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  // Select Partner and Fetch DM logs
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

  // Block/Unblock actions from DM view
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

      // Refresh history list to reflect block status
      fetchHistory();
    } catch (err) {
      console.error(err);
      alert('Error updating block status.');
    }
  };

  // Send message
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

  // Formatters
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredGifs = CURATED_GIFS.filter(gif => 
    gif.name.toLowerCase().includes(gifSearch.toLowerCase()) || 
    gif.tags.toLowerCase().includes(gifSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] w-full text-left">
      
      {/* LEFT PANEL: Interaction History Timeline */}
      <div className={`flex-1 lg:max-w-md glass rounded-3xl flex flex-col border border-white/10 overflow-hidden ${activePartner ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-5 border-b border-white/5 bg-black/15 flex items-center justify-between">
          <h2 className="text-lg font-bold title-font text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            <span>Interaction History</span>
          </h2>
          <button 
            onClick={fetchHistory}
            className="text-xs text-indigo-400 font-semibold hover:underline cursor-pointer"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 p-6">
              <Calendar className="w-10 h-10 mb-2 opacity-35" />
              <p className="text-sm">No match history found yet.</p>
              <p className="text-xs mt-1 text-gray-600">Start matching to build connections!</p>
            </div>
          ) : (
            history.map((log) => {
              const isPartnerOnline = presenceStatuses[log.partner_id] === 'online' || log.partner_status === 'online';
              const isBlocked = log.is_blocked_by_user === 1;

              return (
                <div 
                  key={log.id}
                  onClick={() => handleSelectPartner(log.partner_id, log.partner_name, isBlocked)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${activePartner?.id === log.partner_id ? 'bg-indigo-600/10 border-indigo-500/40 glow-indigo' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Status Dot Ring */}
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-gray-300 capitalize text-sm select-none">
                        {log.partner_name.substring(0, 2)}
                      </div>
                      <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-gray-950 ${isBlocked ? 'bg-red-500' : isPartnerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`}></span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white truncate">{log.partner_name}</span>
                        {isBlocked && (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/10">Blocked</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-gray-400 mt-1 select-none">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-gray-500" /> {formatDate(log.started_at)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-500" /> {formatDuration(log.duration_seconds)}</span>
                      </div>
                    </div>
                  </div>

                  <MessageSquare className="w-4 h-4 text-gray-500 hover:text-indigo-400 shrink-0 transition" />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Reconnection Messaging Board */}
      <div className={`flex-1 glass rounded-3xl flex flex-col border border-white/10 overflow-hidden ${!activePartner ? 'hidden lg:flex' : 'flex'}`}>
        {activePartner ? (
          <>
            {/* DM Header */}
            <div className="p-4 border-b border-white/5 bg-black/15 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Mobile Back Button */}
                <button 
                  onClick={() => setActivePartner(null)}
                  className="p-1 rounded-full text-gray-400 hover:bg-white/10 lg:hidden cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="relative select-none">
                  <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-gray-300 capitalize text-xs">
                    {activePartner.username.substring(0, 2)}
                  </div>
                  <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-gray-950 ${activePartner.isBlocked ? 'bg-red-500' : presenceStatuses[activePartner.id] === 'online' ? 'bg-emerald-500' : 'bg-gray-500'}`}></span>
                </div>

                <div>
                  <h3 className="font-bold text-sm text-white">{activePartner.username}</h3>
                  <p className="text-[10px] text-gray-400 select-none">
                    {activePartner.isBlocked 
                      ? 'Blocked user' 
                      : presenceStatuses[activePartner.id] === 'online' 
                        ? 'Active now' 
                        : 'Offline (messages will deliver on login)'}
                  </p>
                </div>
              </div>

              {/* Block/Unblock toggle */}
              <button 
                onClick={toggleBlockStatus}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${activePartner.isBlocked ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'}`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{activePartner.isBlocked ? 'Unblock User' : 'Block User'}</span>
              </button>
            </div>

            {/* DMs View Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/10">
              {dmMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 p-6 select-none">
                  <MessageSquare className="w-10 h-10 mb-2 opacity-25" />
                  <p className="text-sm font-semibold">Start the conversation</p>
                  <p className="text-xs text-gray-600 mt-0.5">Send a message to reconnect with {activePartner.username}!</p>
                </div>
              ) : (
                dmMessages.map((msg) => {
                  const isSelf = msg.sender_id === user.id;
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col max-w-[75%] ${isSelf ? 'ml-auto items-end' : 'mr-auto items-start'} animate-fade-in`}
                    >
                      <div className={`p-3 rounded-2xl text-sm ${isSelf ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white/10 text-gray-200 rounded-tl-none border border-white/5'}`}>
                        {msg.message_type === 'text' && (
                          <p className="break-all whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                        {msg.message_type === 'image' && (
                          <a href={msg.content} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-black/20 hover:opacity-90">
                            <img src={msg.content} alt="Shared attachment" className="max-w-[200px] max-h-[160px] object-cover" />
                          </a>
                        )}
                        {msg.message_type === 'gif' && (
                          <div className="overflow-hidden rounded-lg border border-black/20">
                            <img src={msg.content} alt="Shared GIF" className="max-w-[200px] max-h-[160px] object-cover" />
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-gray-500 mt-1 px-1">{formatDate(msg.sent_at)}</span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendDm} className="p-3 border-t border-white/5 bg-black/15 flex flex-col gap-2 relative">
              
              {/* GIF PICKER */}
              {showGifPicker && (
                <div className="absolute bottom-16 left-3 right-3 bg-gray-950/95 border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-col z-20 h-64 animate-fade-in backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-300">Share Reaction GIF</span>
                    <button 
                      type="button" 
                      onClick={() => setShowGifPicker(false)}
                      className="p-1 rounded-full text-gray-400 hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <input 
                    type="text" 
                    placeholder="Search GIFs..."
                    value={gifSearch}
                    onChange={(e) => setGifSearch(e.target.value)}
                    className="w-full py-1.5 px-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
                  />

                  <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2">
                    {filteredGifs.map((gif, idx) => (
                      <button 
                        key={idx}
                        type="button"
                        onClick={() => sendGif(gif.url)}
                        className="overflow-hidden rounded-lg border border-white/5 hover:border-indigo-500 transition cursor-pointer h-16 bg-black flex items-center justify-center"
                      >
                        <img src={gif.url} alt={gif.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Input fields */}
              {activePartner.isBlocked ? (
                <div className="p-3 text-center rounded-xl bg-red-500/10 border border-red-500/10 text-red-400 text-xs flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>You have blocked this user. Unblock them to message.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
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
                    className="p-2 rounded-xl text-gray-400 hover:text-indigo-400 active:scale-95 transition hover:bg-white/5 cursor-pointer shrink-0"
                    title="Send Image"
                  >
                    {uploadingImage ? (
                      <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    ) : (
                      <ImageIcon className="w-5 h-5" />
                    )}
                  </button>

                  <button 
                    type="button"
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    className="p-2 rounded-xl text-gray-400 hover:text-indigo-400 active:scale-95 transition hover:bg-white/5 cursor-pointer shrink-0"
                    title="Send GIF"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <input
                    type="text"
                    placeholder="Type a direct message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 py-2 px-4 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white transition active:scale-95 cursor-pointer shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 p-6 select-none">
            <MessageSquare className="w-12 h-12 mb-3 opacity-25" />
            <h3 className="text-base font-semibold text-gray-400">Reconnection Panel</h3>
            <p className="text-xs text-gray-600 mt-1 max-w-xs leading-relaxed">
              Select an interaction partner from the history board on the left to review chat transcripts or reconnect with them!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
