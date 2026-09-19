import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Video, History, LogOut, User } from 'lucide-react';
import Auth from './components/Auth';
import ChatRoom from './components/ChatRoom';
import HistoryBoard from './components/HistoryBoard';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [socket, setSocket] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(() => !!localStorage.getItem('token'));

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  }, [socket]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    async function checkMe() {
      try {
        const res = await fetch('https://video-chat-backend-c5ap.onrender.com/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (isMounted) {
          if (res.ok) {
            setUser(data.user);
            localStorage.setItem('token', token);
          } else {
            handleLogout();
          }
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    }
    checkMe();

    return () => {
      isMounted = false;
    };
  }, [token, handleLogout]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    const socketInstance = io('https://video-chat-backend-c5ap.onrender.com', {
      auth: { token }
    });

    socketInstance.on('connect', () => {
      console.log('Socket.io client connected');
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      if (err.message.includes('Authentication')) {
        handleLogout();
      }
    });

    queueMicrotask(() => {
      setSocket(socketInstance);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user, handleLogout]);

  const handleAuthSuccess = (newToken, authUser) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(authUser);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0e1013] flex flex-col items-center justify-center gap-3 text-zinc-400">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin"></div>
        <p className="text-xs font-medium tracking-wide">Verifying session...</p>
      </div>
    );
  }

  if (!token || !user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#0e1013] flex flex-col antialiased text-zinc-200">
      {/* Sleek Minimal Header */}
      <header className="bg-[#14161b] border-b border-[#232731] sticky top-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#1d2028] border border-[#2d3240] flex items-center justify-center text-zinc-200">
              <Video className="w-4 h-4 text-zinc-300" />
            </div>
            <span className="text-sm font-semibold text-zinc-100 tracking-tight">
              RandomChat
            </span>
          </div>

          {/* Navigation Tab Pills */}
          <div className="flex items-center gap-1 p-1 bg-[#0e1013] border border-[#232731] rounded-lg">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-[#222631] text-zinc-100 border border-[#323847] shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181e]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Random Matching</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#222631] text-zinc-100 border border-[#323847] shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181e]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History & DMs</span>
            </button>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#181a20] border border-[#242833] text-xs text-zinc-300 font-medium select-none capitalize">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>{user.username}</span>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-[#181a20] hover:bg-[#20242e] active:scale-95 text-zinc-400 hover:text-rose-400 border border-[#242833] cursor-pointer transition"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content Container */}
      <main className="max-w-7xl mx-auto w-full px-5 py-5 flex-1 flex flex-col justify-start">
        {activeTab === 'chat' ? (
          <ChatRoom socket={socket} token={token} user={user} />
        ) : (
          <HistoryBoard socket={socket} token={token} user={user} />
        )}
      </main>
    </div>
  );
}
