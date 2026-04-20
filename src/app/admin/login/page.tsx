"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    
    setLoading(false);
    
    if (res.ok) {
      router.push("/admin/dashboard");
    } else {
      const data = await res.json();
      setError(data.error || "登录失败");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="card max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-fade-in"
               style={{ background: 'var(--brand-primary)' }}>
            <span className="text-white font-bold text-3xl">E</span>
          </div>
          <h1 className="text-2xl font-display font-bold animate-fade-in-up stagger-1">
            管理员登录
          </h1>
          <p className="text-sm mt-2 animate-fade-in-up stagger-2" 
             style={{ color: 'var(--text-muted)' }}>
            EduManager 后台管理系统
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm animate-fade-in"
               style={{ background: '#fee2e2', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="animate-fade-in-up stagger-2">
            <label className="block text-sm font-medium mb-2" 
                   style={{ color: 'var(--text-secondary)' }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
            />
          </div>

          <div className="animate-fade-in-up stagger-3">
            <label className="block text-sm font-medium mb-2"
                   style={{ color: 'var(--text-secondary)' }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="admin123"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn-primary w-full animate-fade-in-up stagger-4"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        {/* Hint */}
        <p className="text-center text-xs mt-6 animate-fade-in-up stagger-4"
           style={{ color: 'var(--text-muted)' }}>
          默认账号: admin / admin123
        </p>
      </div>
    </div>
  );
}