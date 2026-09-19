import { useState } from 'react';
import { KeyRound, User, AlertCircle, ArrowRight, Video } from 'lucide-react';

export default function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    try {
      const response = await fetch(`https://video-chat-backend-c5ap.onrender.com${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      onAuthSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1013] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#14161b] border border-[#232731] rounded-xl p-7 shadow-sm">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#1e222b] border border-[#2d3342] flex items-center justify-center mb-3 text-zinc-200">
            <Video className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
            {isLogin ? 'Sign in to RandomChat' : 'Create an account'}
          </h1>
          <p className="text-zinc-400 mt-1 text-xs">
            {isLogin ? 'Connect with people around the world.' : 'Get started with random matching.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-zinc-400 text-xs font-medium mb-1.5">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full py-2 pl-9 pr-3 bg-[#0e1013] border border-[#272b36] rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 text-xs transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 text-xs font-medium mb-1.5">Password</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full py-2 pl-9 pr-3 bg-[#0e1013] border border-[#272b36] rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 text-xs transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-zinc-100 hover:bg-white active:scale-[0.99] text-zinc-900 font-medium rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin"></div>
            ) : (
              <>
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#232731] text-center">
          <p className="text-zinc-400 text-xs">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setUsername('');
                setPassword('');
              }}
              className="text-zinc-200 hover:text-white font-medium underline underline-offset-2 transition cursor-pointer"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
