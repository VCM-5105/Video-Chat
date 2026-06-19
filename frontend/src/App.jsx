import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { MessageSquare, Video, History, LogOut, User } from 'lucide-react';
import Auth from './components/Auth';
import ChatRoom from './components/ChatRoom';
import HistoryBoard from './components/HistoryBoard';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'history'
  const [socket, setSocket] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setCheckingAuth(false);
      return;
    }

    async function checkMe() {
      try {
        const res = await fetch('https://video-chat-backend-c5ap.onrender.com/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok) {
          setUser(data.user);
          localStorage.setItem('token', token);
        } else {
          
          handleLogout();
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkMe();
  }, [token]);

 
  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
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

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user]);

  const handleAuthSuccess = (newToken, authUser) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(authUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0b0c10] flex flex-col items-center justify-center gap-4 text-indigo-300">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="text-sm font-semibold animate-pulse tracking-wider">Verifying session...</p>
      </div>
    );
  }

  if (!token || !user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] flex flex-col antialiased">
     
      <header className="glass border-b border-white/5 sticky top-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-linear-to-tr from-indigo-500 to-pink-500 flex items-center justify-center glow-indigo">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold title-font bg-linear-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
              Random Chat
            </span>
          </div>

         
          <div className="flex items-center gap-2 p-1.5 bg-black/30 border border-white/5 rounded-2xl">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-md glow-indigo' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Random Matching</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md glow-indigo' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History & DMs</span>
            </button>
          </div>

          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300 font-semibold select-none capitalize">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>{user.username}</span>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 border border-red-500/10 cursor-pointer transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

     
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 flex flex-col justify-start">
        {activeTab === 'chat' ? (
          <ChatRoom socket={socket} token={token} user={user} />
        ) : (
          <HistoryBoard socket={socket} token={token} user={user} />
        )}
      </main>
    </div>
  );
}
