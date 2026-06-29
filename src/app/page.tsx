import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-4xl mx-auto space-y-8 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold tracking-wide uppercase mb-4 animate-pulse">
          ⚡ Local-First & Real-time Collaboration
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-none">
          House of Edtech <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
            Collaborative Canvas
          </span>
        </h1>
        
        <p className="max-w-xl mx-auto text-lg md:text-xl text-slate-300 font-light">
          A high-performance, local-first rich document editor. Work offline with automatic sync, conflict-free resolution, and time-travel version control.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all duration-300 flex items-center justify-center gap-2 hover:scale-105"
          >
            Get Started
          </Link>
          <Link
            href="/register"
            className="w-full sm:w-auto px-8 py-3 rounded-xl bg-slate-800 text-slate-200 border border-slate-700/50 hover:bg-slate-700/50 transition-all duration-300 flex items-center justify-center gap-2"
          >
            Create Account
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left">
          <div className="p-6 rounded-2xl glass-card space-y-3">
            <div className="text-2xl">💾</div>
            <h3 className="text-lg font-bold text-white">Local-First Storage</h3>
            <p className="text-sm text-slate-400">
              Your edits are saved instantly in your browser's IndexedDB. Open, edit, and exit with zero latency, even with no network connection.
            </p>
          </div>

          <div className="p-6 rounded-2xl glass-card space-y-3">
            <div className="text-2xl">🔄</div>
            <h3 className="text-lg font-bold text-white">Deterministic Sync</h3>
            <p className="text-sm text-slate-400">
              When online, changes merge smoothly using Lamport clocks. We resolve edit conflicts deterministically without overwriting user data.
            </p>
          </div>

          <div className="p-6 rounded-2xl glass-card space-y-3">
            <div className="text-2xl">⏳</div>
            <h3 className="text-lg font-bold text-white">Time Travel History</h3>
            <p className="text-sm text-slate-400">
              Capture instant snapshot versions. View past versions and restore previous content safely without disrupting active co-editors.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
