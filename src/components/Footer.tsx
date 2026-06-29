"use client";

export default function Footer() {
  const name = "Setu Dinesh Patel";
  const githubUrl = "https://github.com/setu1123";
  const linkedinUrl = "https://www.linkedin.com/in/setu-patel-a8b3b2275";

  return (
    <footer className="w-full py-6 px-8 border-t border-slate-800/60 bg-slate-950/40 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0 mt-auto">
      <div>© 2026 House of Edtech Collaborative Canvas. All rights reserved.</div>
      <div className="flex items-center gap-3">
        <span>Candidate: <strong className="text-slate-300">{name}</strong></span>
        <span className="text-slate-700">|</span>
        <a
          href={githubUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:text-indigo-400 transition-colors font-medium"
        >
          GitHub Profile
        </a>
        <span className="text-slate-700">|</span>
        <a
          href={linkedinUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:text-indigo-400 transition-colors font-medium"
        >
          LinkedIn Profile
        </a>
      </div>
    </footer>
  );
}
