import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, SkipForward, Ban, AlertTriangle, 
  Send, Image as ImageIcon, Smile, X, ShieldAlert 
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

export default function ChatRoom({ socket, token, user }) {
  const [status, setStatus] = useState('idle'); // idle, searching, connected
  const [partner, setPartner] = useState(null);
  
  // Media states
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  
  // Chat messaging states
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Duration tracking
  const [callDuration, setCallDuration] = useState(0);
  
  // Report Modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  // DOM & WebRTC references
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // WebRTC ICE Configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19002' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Get local media on load
  useEffect(() => {
    async function getMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error getting media devices:', err);
        // Try audio only as fallback
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setLocalStream(audioStream);
        } catch (innerErr) {
          console.error('Audio fallback failed:', innerErr);
        }
      }
    }
    getMedia();

    return () => {
      stopLocalStream();
      closePeerConnection();
      clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('waiting', (data) => {
      setStatus('searching');
      resetChatSession();
    });

    socket.on('matched', async (data) => {
      console.log('Room matched:', data);
      setPartner(data.partner);
      setStatus('connected');
      setCallDuration(0);
      
      // Start duration clock
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      // Initialize peer connection
      await setupPeerConnection(data.roomId, data.initiator);
    });

    socket.on('signal', async (data) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        if (data.signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
          if (data.signal.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { signal: { sdp: pc.localDescription } });
          }
        } else if (data.signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
      }
    });

    socket.on('room-message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('peer-disconnected', (data) => {
      console.log('Peer disconnected:', data);
      setStatus('idle');
      clearInterval(timerIntervalRef.current);
      closePeerConnection();
      setRemoteStream(null);
      // Append a system message
      setMessages(prev => [...prev, {
        senderId: 'system',
        senderName: 'System',
        type: 'text',
        content: `Conversation ended. Duration: ${formatTime(data.durationSeconds || callDuration)}. Partner ${data.reason === 'blocked' ? 'blocked and reported you.' : 'skipped/disconnected.'}`,
        sentAt: new Date()
      }]);
    });

    return () => {
      socket.off('waiting');
      socket.off('matched');
      socket.off('signal');
      socket.off('room-message');
      socket.off('peer-disconnected');
    };
  }, [socket, localStream, callDuration]);

  // Scroll to bottom on chat messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebRTC Setup Helper
  const setupPeerConnection = async (roomId, isInitiator) => {
    closePeerConnection();
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { signal: { candidate: event.candidate } });
      }
    };

    // Track received
    pc.ontrack = (event) => {
      console.log('Received remote track');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { signal: { sdp: pc.localDescription } });
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    }
  };

  const stopLocalStream = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
  };

  const closePeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const resetChatSession = () => {
    closePeerConnection();
    setRemoteStream(null);
    setPartner(null);
    setMessages([]);
    setCallDuration(0);
    clearInterval(timerIntervalRef.current);
  };

  const startSearch = () => {
    if (!socket) return;
    setStatus('searching');
    socket.emit('search-match');
  };

  const skipMatch = () => {
    if (!socket) return;
    socket.emit('skip-match');
    setStatus('searching');
    socket.emit('search-match');
  };

  const stopSearch = () => {
    if (!socket) return;
    socket.emit('skip-match');
    setStatus('idle');
    resetChatSession();
  };

  const toggleCam = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOn(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  // Chat message senders
  const sendTextMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;
    socket.emit('send-room-message', {
      type: 'text',
      content: inputText.trim()
    });
    setInputText('');
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;
    
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
      if (!res.ok) throw new Error(data.error || 'Failed to upload image');

      socket.emit('send-room-message', {
        type: 'image',
        content: data.url
      });
    } catch (err) {
      console.error(err);
      alert('Error uploading image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const sendGif = (gifUrl) => {
    if (!socket) return;
    socket.emit('send-room-message', {
      type: 'gif',
      content: gifUrl
    });
    setShowGifPicker(false);
  };

  // Block & Report triggers
  const handleBlock = async () => {
    if (!partner || !confirm(`Are you sure you want to block ${partner.username}?`)) return;

    try {
      // Direct block socket signal so it terminates the room immediately
      socket.emit('block-current-partner');

      // Call API to store block in SQLite
      await fetch('https://video-chat-backend-c5ap.onrender.com/api/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ blockedId: partner.id })
      });

      setStatus('idle');
      resetChatSession();
      setMessages(prev => [...prev, {
        senderId: 'system',
        senderName: 'System',
        type: 'text',
        content: `You blocked ${partner.username}. Connection terminated.`,
        sentAt: new Date()
      }]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReport = async () => {
    if (!partner || !reportReason.trim()) return;

    try {
      // Disconnect socket call first
      socket.emit('block-current-partner');

      // POST Report API (which blocks them too)
      await fetch('https://video-chat-backend-c5ap.onrender.com/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reportedId: partner.id, reason: reportReason })
      });

      setShowReportModal(false);
      setReportReason('');
      setStatus('idle');
      resetChatSession();
      setMessages(prev => [...prev, {
        senderId: 'system',
        senderName: 'System',
        type: 'text',
        content: `Report submitted. User has been blocked.`,
        sentAt: new Date()
      }]);
    } catch (err) {
      console.error(err);
    }
  };

  // Utilities
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredGifs = CURATED_GIFS.filter(gif => 
    gif.name.toLowerCase().includes(gifSearch.toLowerCase()) || 
    gif.tags.toLowerCase().includes(gifSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] w-full">
      {/* LEFT: Video & Controls Section */}
      <div className="flex-1 flex flex-col gap-4 relative h-full">
        {/* Videos Container */}
        <div className="flex-1 grid grid-rows-2 sm:grid-rows-1 sm:grid-cols-2 gap-4 relative">
          
          {/* LOCAL VIDEO FEED */}
          <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/5 shadow-inner flex items-center justify-center">
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            {/* Overlay label */}
            <div className="absolute top-4 left-4 py-1.5 px-3 rounded-full bg-black/60 backdrop-blur-md text-xs font-semibold text-gray-300 border border-white/10 select-none">
              You ({user.username})
            </div>
            {/* Status if camera off */}
            {!isCamOn && (
              <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center text-gray-500 gap-2">
                <VideoOff className="w-12 h-12" />
                <span className="text-sm">Camera Off</span>
              </div>
            )}
          </div>

          {/* REMOTE VIDEO FEED */}
          <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/5 shadow-inner flex items-center justify-center remote-video">
            {status === 'connected' && remoteStream ? (
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gray-950/40 flex flex-col items-center justify-center text-center p-6 gap-4">
                {status === 'searching' ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-16 h-16 rounded-full border-2 border-indigo-500/30 animate-ping-slow"></div>
                      <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-indigo-500 animate-spin"></div>
                    </div>
                    <p className="text-indigo-200 font-semibold animate-pulse text-sm">Finding matching peers...</p>
                  </div>
                ) : (
                  <div className="text-gray-500 flex flex-col items-center gap-2">
                    <Video className="w-12 h-12 text-gray-600" />
                    <p className="text-sm">Click "Start Matching" to connect with a partner.</p>
                  </div>
                )}
              </div>
            )}

            {/* Partner Details Overlay */}
            {status === 'connected' && partner && (
              <>
                <div className="absolute top-4 left-4 py-1.5 px-3 rounded-full bg-black/60 backdrop-blur-md text-xs font-semibold text-gray-300 border border-white/10 select-none flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span>Interacting with: {partner.username}</span>
                </div>
                {/* Call Timer clock */}
                <div className="absolute top-4 right-4 py-1.5 px-3 rounded-full bg-black/60 backdrop-blur-md text-xs font-mono text-indigo-300 border border-white/10 select-none">
                  {formatTime(callDuration)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* CONTROLLER BAR */}
        <div className="glass rounded-2xl p-4 flex items-center justify-between gap-4 border border-white/10 shadow-lg">
          {/* Media Toggles */}
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleCam}
              disabled={status === 'searching'}
              className={`p-3 rounded-xl cursor-pointer active:scale-95 transition ${isCamOn ? 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
              title={isCamOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
              {isCamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
            <button 
              onClick={toggleMic}
              disabled={status === 'searching'}
              className={`p-3 rounded-xl cursor-pointer active:scale-95 transition ${isMicOn ? 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
              title={isMicOn ? 'Mute Mic' : 'Unmute Mic'}
            >
              {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
          </div>

          {/* Chat Actions */}
          <div className="flex items-center gap-3">
            {status === 'connected' && (
              <>
                <button 
                  onClick={handleBlock}
                  className="px-4 py-2.5 bg-red-600/15 hover:bg-red-600/25 active:scale-95 text-red-400 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition border border-red-500/25 cursor-pointer"
                  title="Block partner"
                >
                  <Ban className="w-4 h-4" />
                  <span>Block</span>
                </button>
                <button 
                  onClick={() => setShowReportModal(true)}
                  className="px-4 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 text-amber-400 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition border border-amber-500/25 cursor-pointer"
                  title="Report partner for misbehavior"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Report</span>
                </button>
              </>
            )}
          </div>

          {/* Matching controls */}
          <div>
            {status === 'idle' ? (
              <button 
                onClick={startSearch}
                className="py-2.5 px-6 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white font-semibold rounded-xl shadow-lg transition duration-200 text-sm cursor-pointer"
              >
                Start Matching
              </button>
            ) : status === 'searching' ? (
              <button 
                onClick={stopSearch}
                className="py-2.5 px-6 bg-gray-800 hover:bg-gray-750 active:scale-95 text-gray-300 font-semibold rounded-xl border border-white/10 transition text-sm cursor-pointer"
              >
                Cancel Search
              </button>
            ) : (
              <button 
                onClick={skipMatch}
                className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold rounded-xl shadow-lg hover:shadow-indigo-500/20 flex items-center gap-2 transition text-sm cursor-pointer"
              >
                <span>Skip Partner</span>
                <SkipForward className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Text Chat Sidebar Section */}
      <div className="w-full lg:w-96 glass rounded-3xl flex flex-col border border-white/10 shadow-2xl relative overflow-hidden h-full">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm title-font text-gray-200">Text Chat Session</h2>
            {status === 'connected' && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 font-medium">Omegle style</span>
        </div>

        {/* Message Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 p-6">
              <Smile className="w-8 h-8 mb-2 opacity-35" />
              <p className="text-xs">No messages yet. Send a message to break the ice!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              if (msg.senderId === 'system') {
                return (
                  <div key={idx} className="p-3 bg-white/5 border border-white/5 rounded-2xl text-center text-xs text-gray-400 leading-relaxed animate-fade-in">
                    {msg.content}
                  </div>
                );
              }

              const isSelf = msg.senderId === user.id;
              return (
                <div key={idx} className={`flex flex-col max-w-[85%] ${isSelf ? 'ml-auto items-end' : 'mr-auto items-start'} animate-fade-in`}>
                  {/* Sender Name */}
                  <span className="text-[10px] text-gray-500 font-semibold mb-1 px-1">{msg.senderName}</span>
                  
                  {/* Speech bubble contents */}
                  <div className={`p-3 rounded-2xl text-sm ${isSelf ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white/10 text-gray-200 rounded-tl-none border border-white/5'}`}>
                    {msg.type === 'text' && (
                      <p className="break-all whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                    {msg.type === 'image' && (
                      <a href={msg.content} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-black/20 hover:opacity-90">
                        <img src={msg.content} alt="Shared upload" className="max-w-50 max-h-40 object-cover" />
                      </a>
                    )}
                    {msg.type === 'gif' && (
                      <div className="overflow-hidden rounded-lg border border-black/20">
                        <img src={msg.content} alt="Reaction GIF" className="max-w-50 max-h-40 object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={sendTextMessage} className="p-3 border-t border-white/5 bg-black/10 flex flex-col gap-2 relative">
          
          {/* GIF PICKER POPOVER */}
          {showGifPicker && (
            <div className="absolute bottom-16 left-3 right-3 bg-gray-950/95 border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-col z-20 h-64 animate-fade-in backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-300">Choose Reaction GIF</span>
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
                placeholder="Search reaction GIFs..."
                value={gifSearch}
                onChange={(e) => setGifSearch(e.target.value)}
                className="w-full py-1.5 px-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
              />

              <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2">
                {filteredGifs.length === 0 ? (
                  <div className="col-span-3 text-center text-xs text-gray-500 py-6">No matching GIFs found</div>
                ) : (
                  filteredGifs.map((gif, idx) => (
                    <button 
                      key={idx}
                      type="button"
                      onClick={() => sendGif(gif.url)}
                      className="overflow-hidden rounded-lg border border-white/5 hover:border-indigo-500 transition cursor-pointer h-16 bg-black flex items-center justify-center"
                    >
                      <img src={gif.url} alt={gif.name} className="w-full h-full object-cover" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Form Actions and Text Input */}
          <div className="flex items-center gap-2">
            {/* Image attachment */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <button 
              type="button"
              disabled={status !== 'connected' || uploadingImage}
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl text-gray-400 hover:text-indigo-400 active:scale-95 disabled:opacity-30 disabled:scale-100 transition hover:bg-white/5 cursor-pointer shrink-0"
              title="Share Image"
            >
              {uploadingImage ? (
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </button>

            {/* GIF Button */}
            <button 
              type="button"
              disabled={status !== 'connected'}
              onClick={() => setShowGifPicker(!showGifPicker)}
              className="p-2 rounded-xl text-gray-400 hover:text-indigo-400 active:scale-95 disabled:opacity-30 disabled:scale-100 transition hover:bg-white/5 cursor-pointer shrink-0"
              title="Add Reaction GIF"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Input field */}
            <input
              type="text"
              placeholder={status === 'connected' ? "Type a message..." : "Connect to start chatting"}
              value={inputText}
              disabled={status !== 'connected'}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 py-2 px-4 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 text-sm"
            />

            {/* Send submit button */}
            <button
              type="submit"
              disabled={status !== 'connected' || !inputText.trim()}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white transition active:scale-95 cursor-pointer disabled:scale-100 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <ShieldAlert className="w-7 h-7" />
              <h2 className="text-xl font-bold title-font text-white">Report Misbehavior</h2>
            </div>
            
            <p className="text-xs text-gray-400">
              Reporting this user will immediately terminate the conversation and block them permanently. They will not be matched with you again.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">Reason for Report</label>
              <textarea 
                placeholder="Describe the misbehavior (e.g. harassment, inappropriate display, offensive language...)"
                rows={4}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setShowReportModal(false)}
                className="flex-1 py-2 px-4 bg-gray-800 hover:bg-gray-750 text-gray-300 font-semibold rounded-xl text-xs border border-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleReport}
                disabled={!reportReason.trim()}
                className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Report & Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
