import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, SkipForward, Ban, AlertTriangle, 
  Send, Image as ImageIcon, Smile, X, ShieldAlert 
} from 'lucide-react';
import { BACKEND_URL } from '../config';

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

// Production WebRTC configuration including STUN and free OpenRelay TURN servers for NAT traversal
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ChatRoom({ socket, token, user }) {
  const [status, setStatus] = useState('idle'); // idle, searching, connected
  const [partner, setPartner] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(socket?.connected || false);
  
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
  const candidateQueueRef = useRef([]);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Monitor socket connection state
  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      console.log('Socket connected in ChatRoom');
      setIsSocketConnected(true);
    };

    const onDisconnect = () => {
      console.log('Socket disconnected in ChatRoom');
      setIsSocketConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    candidateQueueRef.current = [];
  }, []);

  const stopLocalStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
  }, [localStream]);

  const resetChatSession = useCallback(() => {
    closePeerConnection();
    setRemoteStream(null);
    setPartner(null);
    setMessages([]);
    setCallDuration(0);
    clearInterval(timerIntervalRef.current);
  }, [closePeerConnection]);

  const setupPeerConnection = useCallback(async (roomId, isInitiator) => {
    closePeerConnection();
    candidateQueueRef.current = [];
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    // Attach local tracks if available
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('signal', { signal: { candidate: event.candidate } });
      }
    };

    // Monitor ICE connection status
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    // Incoming remote track handler
    pc.ontrack = (event) => {
      console.log('Remote track received:', event.streams[0]);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);
        if (socket) {
          socket.emit('signal', { signal: { sdp: pc.localDescription } });
        }
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    }
  }, [closePeerConnection, localStream, socket]);

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
  }, [stopLocalStream, closePeerConnection]);

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('waiting', () => {
      setStatus('searching');
      resetChatSession();
    });

    socket.on('matched', async (data) => {
      console.log('Match received:', data);
      setPartner(data.partner);
      setStatus('connected');
      setCallDuration(0);
      
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      await setupPeerConnection(data.roomId, data.initiator);
    });

    socket.on('signal', async (data) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        if (data.signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));

          // Drain and apply any queued candidates that arrived before remoteDescription
          while (candidateQueueRef.current.length > 0) {
            const queuedCandidate = candidateQueueRef.current.shift();
            try {
              await pc.addIceCandidate(new RTCIceCandidate(queuedCandidate));
            } catch (candErr) {
              console.error('Error applying buffered candidate:', candErr);
            }
          }

          if (data.signal.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { signal: { sdp: pc.localDescription } });
          }
        } else if (data.signal.candidate) {
          // If remoteDescription is not set yet, buffer candidate to prevent exception
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            candidateQueueRef.current.push(data.signal.candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
          }
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
      }
    });

    socket.on('room-message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('peer-disconnected', (data) => {
      setStatus('idle');
      clearInterval(timerIntervalRef.current);
      closePeerConnection();
      setRemoteStream(null);
      setMessages(prev => [...prev, {
        senderId: 'system',
        senderName: 'System',
        type: 'text',
        content: `Conversation ended (${formatTime(data.durationSeconds || callDuration)}). Partner ${data.reason === 'blocked' ? 'blocked and reported you.' : 'disconnected.'}`,
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
  }, [socket, callDuration, resetChatSession, setupPeerConnection, closePeerConnection]);

  // Scroll to bottom on chat messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSearch = () => {
    if (!socket || !socket.connected) return;
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
    if (socket) {
      socket.emit('cancel-search');
    }
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
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
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

  const handleBlock = async () => {
    if (!partner || !confirm(`Are you sure you want to block ${partner.username}?`)) return;

    try {
      socket.emit('block-current-partner');

      await fetch(`${BACKEND_URL}/api/block`, {
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
      socket.emit('block-current-partner');

      await fetch(`${BACKEND_URL}/api/report`, {
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

  const filteredGifs = CURATED_GIFS.filter(gif => 
    gif.name.toLowerCase().includes(gifSearch.toLowerCase()) || 
    gif.tags.toLowerCase().includes(gifSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-120px)] w-full">
      {/* LEFT: Video & Controls Section */}
      <div className="flex-1 flex flex-col gap-3 relative h-full">
        {/* Videos Grid */}
        <div className="flex-1 grid grid-rows-2 sm:grid-rows-1 sm:grid-cols-2 gap-3 relative">
          
          {/* LOCAL VIDEO FEED */}
          <div className="relative rounded-xl overflow-hidden bg-[#111317] border border-[#232731] flex items-center justify-center">
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            
            <div className="absolute top-3 left-3 py-1 px-2.5 rounded-md bg-[#161820]/90 border border-[#272b36] text-[11px] font-medium text-zinc-300 select-none">
              You ({user.username})
            </div>

            {!isCamOn && (
              <div className="absolute inset-0 bg-[#111317] flex flex-col items-center justify-center text-zinc-500 gap-2">
                <VideoOff className="w-8 h-8 text-zinc-600" />
                <span className="text-xs">Camera Off</span>
              </div>
            )}
          </div>

          {/* REMOTE VIDEO FEED */}
          <div className="relative rounded-xl overflow-hidden bg-[#111317] border border-[#232731] flex items-center justify-center remote-video">
            {status === 'connected' && remoteStream ? (
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-[#111317] flex flex-col items-center justify-center text-center p-6 gap-3">
                {status === 'searching' ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin"></div>
                    <p className="text-zinc-400 font-medium text-xs">Finding a partner...</p>
                  </div>
                ) : (
                  <div className="text-zinc-500 flex flex-col items-center gap-2">
                    <Video className="w-8 h-8 text-zinc-600" />
                    <p className="text-xs text-zinc-400">Click "Start Matching" to connect with a partner.</p>
                  </div>
                )}
              </div>
            )}

            {/* Connected Partner Overlays */}
            {status === 'connected' && partner && (
              <>
                <div className="absolute top-3 left-3 py-1 px-2.5 rounded-md bg-[#161820]/90 border border-[#272b36] text-[11px] font-medium text-zinc-300 select-none flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>Partner: {partner.username}</span>
                </div>
                
                <div className="absolute top-3 right-3 py-1 px-2.5 rounded-md bg-[#161820]/90 border border-[#272b36] text-[11px] font-mono text-zinc-300 select-none">
                  {formatTime(callDuration)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* CONTROLLER BAR */}
        <div className="bg-[#14161b] rounded-xl p-3 flex items-center justify-between gap-3 border border-[#232731]">
          {/* Media Toggles */}
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleCam}
              disabled={status === 'searching'}
              className={`p-2.5 rounded-lg cursor-pointer active:scale-95 transition border text-xs ${
                isCamOn 
                  ? 'bg-[#1e222b] text-zinc-200 border-[#2b313e] hover:bg-[#252b36]' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
              }`}
              title={isCamOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
              {isCamOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
            <button 
              onClick={toggleMic}
              disabled={status === 'searching'}
              className={`p-2.5 rounded-lg cursor-pointer active:scale-95 transition border text-xs ${
                isMicOn 
                  ? 'bg-[#1e222b] text-zinc-200 border-[#2b313e] hover:bg-[#252b36]' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
              }`}
              title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
            >
              {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
          </div>

          {/* Connected actions */}
          <div className="flex items-center gap-2">
            {status === 'connected' && (
              <>
                <button 
                  onClick={handleBlock}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 font-medium rounded-lg text-xs flex items-center gap-1.5 transition border border-rose-500/20 cursor-pointer"
                  title="Block partner"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Block</span>
                </button>
                <button 
                  onClick={() => setShowReportModal(true)}
                  className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-400 font-medium rounded-lg text-xs flex items-center gap-1.5 transition border border-amber-500/20 cursor-pointer"
                  title="Report partner"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
              </>
            )}
          </div>

          {/* Matching action with connection readiness feedback */}
          <div>
            {status === 'idle' ? (
              !isSocketConnected ? (
                <button 
                  disabled
                  className="py-2 px-4 bg-[#1e222b] text-zinc-500 font-medium rounded-lg text-xs border border-[#2c3240] flex items-center gap-2 cursor-not-allowed select-none"
                  title="Connecting to server..."
                >
                  <div className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></div>
                  <span>Connecting...</span>
                </button>
              ) : (
                <button 
                  onClick={startSearch}
                  className="py-2 px-4 bg-zinc-100 hover:bg-white active:scale-95 text-zinc-900 font-medium rounded-lg text-xs transition cursor-pointer shadow-xs"
                >
                  Start Matching
                </button>
              )
            ) : status === 'searching' ? (
              <button 
                onClick={stopSearch}
                className="py-2 px-4 bg-[#1e222b] hover:bg-[#262c37] active:scale-95 text-zinc-300 font-medium rounded-lg border border-[#2c3240] transition text-xs cursor-pointer"
              >
                Cancel Search
              </button>
            ) : (
              <button 
                onClick={skipMatch}
                className="py-2 px-4 bg-[#222733] hover:bg-[#2b3140] text-zinc-100 font-medium rounded-lg border border-[#343b4c] flex items-center gap-1.5 transition text-xs cursor-pointer active:scale-95"
              >
                <span>Next</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Text Chat Sidebar Section */}
      <div className="w-full lg:w-80 bg-[#14161b] rounded-xl flex flex-col border border-[#232731] overflow-hidden h-full">
        {/* Sidebar Header */}
        <div className="p-3 border-b border-[#232731] flex items-center justify-between bg-[#111317]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-zinc-200">Text Chat</span>
            {status === 'connected' && (
              <span className="flex h-2 w-2 relative">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-500">
            {status === 'connected' ? 'Active' : isSocketConnected ? 'Ready' : 'Connecting'}
          </span>
        </div>

        {/* Message Panel */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-4">
              <Smile className="w-7 h-7 mb-2 opacity-30" />
              <p className="text-xs">No messages yet.</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              if (msg.senderId === 'system') {
                return (
                  <div key={idx} className="p-2 bg-[#101216] border border-[#20232c] rounded-lg text-center text-xs text-zinc-400 leading-relaxed animate-fade-in">
                    {msg.content}
                  </div>
                );
              }

              const isSelf = msg.senderId === user.id;
              return (
                <div key={idx} className={`flex flex-col max-w-[85%] ${isSelf ? 'ml-auto items-end' : 'mr-auto items-start'} animate-fade-in`}>
                  <span className="text-[10px] text-zinc-500 font-medium mb-1 px-1">{msg.senderName}</span>
                  
                  <div className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                    isSelf 
                      ? 'bg-[#222733] text-zinc-100 border border-[#303746] rounded-tr-none' 
                      : 'bg-[#191c22] text-zinc-200 border border-[#262b35] rounded-tl-none'
                  }`}>
                    {msg.type === 'text' && (
                      <p className="break-all whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.type === 'image' && (
                      <a href={msg.content} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-[#262b35] hover:opacity-90">
                        <img src={msg.content} alt="Shared upload" className="max-w-44 max-h-36 object-cover" />
                      </a>
                    )}
                    {msg.type === 'gif' && (
                      <div className="overflow-hidden rounded border border-[#262b35]">
                        <img src={msg.content} alt="Reaction GIF" className="max-w-44 max-h-36 object-cover" />
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
        <form onSubmit={sendTextMessage} className="p-2.5 border-t border-[#232731] bg-[#111317] flex flex-col gap-2 relative">
          
          {/* GIF PICKER POPOVER */}
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
                {filteredGifs.length === 0 ? (
                  <div className="col-span-3 text-center text-xs text-zinc-500 py-4">No matching GIFs found</div>
                ) : (
                  filteredGifs.map((gif, idx) => (
                    <button 
                      key={idx}
                      type="button"
                      onClick={() => sendGif(gif.url)}
                      className="overflow-hidden rounded border border-[#262b35] hover:border-zinc-400 transition cursor-pointer h-14 bg-black flex items-center justify-center"
                    >
                      <img src={gif.url} alt={gif.name} className="w-full h-full object-cover" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Form Actions and Text Input */}
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
              disabled={status !== 'connected' || uploadingImage}
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 active:scale-95 disabled:opacity-30 transition hover:bg-[#1c1f28] cursor-pointer shrink-0"
              title="Share Image"
            >
              {uploadingImage ? (
                <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin"></div>
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </button>

            <button 
              type="button" 
              disabled={status !== 'connected'}
              onClick={() => setShowGifPicker(!showGifPicker)}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 active:scale-95 disabled:opacity-30 transition hover:bg-[#1c1f28] cursor-pointer shrink-0"
              title="Add Reaction GIF"
            >
              <Smile className="w-4 h-4" />
            </button>

            <input
              type="text"
              placeholder={status === 'connected' ? "Type a message..." : "Connect to chat"}
              value={inputText}
              disabled={status !== 'connected'}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 py-1.5 px-3 bg-[#0e1013] border border-[#262b35] rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 disabled:opacity-50 text-xs"
            />

            <button
              type="submit"
              disabled={status !== 'connected' || !inputText.trim()}
              className="p-2 rounded-lg bg-zinc-100 hover:bg-white disabled:bg-[#1a1d24] disabled:text-zinc-600 text-zinc-900 transition active:scale-95 cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm bg-[#14161b] border border-[#272b36] rounded-xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center gap-2.5 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
              <h2 className="text-sm font-semibold text-zinc-100">Report User</h2>
            </div>
            
            <p className="text-xs text-zinc-400 leading-relaxed">
              Reporting this user will terminate the conversation and block them permanently.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 block">Reason</label>
              <textarea 
                placeholder="Describe the issue (e.g. harassment, inappropriate content...)"
                rows={3}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full py-2 px-3 bg-[#0e1013] border border-[#262b35] rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setShowReportModal(false)}
                className="flex-1 py-2 px-3 bg-[#1e222b] hover:bg-[#252a35] text-zinc-300 font-medium rounded-lg text-xs border border-[#2b313e] transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleReport}
                disabled={!reportReason.trim()}
                className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs transition cursor-pointer"
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
