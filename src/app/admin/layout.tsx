"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLogged, setIsLogged] = useState(false);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data.isLoggedIn) {
          setIsLogged(true);
          setUsername(data.username);
        } else if (pathname !== "/admin/login") {
          router.push("/admin/login");
        }
        setLoading(false);
      });
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    router.push("/admin/login");
  }

  // Loading state
  if (loading && pathname !== "/admin/login") {
    return (
      <div className="min-h-screen flex items-center justify-center" 
           style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg mx-auto mb-4 animate-pulse"
               style={{ background: 'var(--brand-light)' }} />
          <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
        </div>
      </div>
    );
  }

  // Login page - no nav
  if (pathname === "/admin/login") return <>{children}</>;

  // Not logged in
  if (!isLogged) return null;

  const navItems = [
    { href: "/admin/dashboard", label: "仪表盘" },
    { href: "/admin/upload", label: "上传讲义" },
    { href: "/admin/categories", label: "分类管理" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Navigation */}
      <nav className="px-8 py-4 flex items-center justify-between border-b border-black/6"
           style={{ background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="font-display font-bold">管理后台</span>
          </div>
          
          <div className="flex gap-1">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {username}
          </span>
          <button onClick={logout} className="text-sm hover:underline" style={{ color: '#dc2626' }}>
            退出
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 text-center text-sm border-t border-black/6"
               style={{ color: 'var(--text-muted)' }}>
        EduManager · 管理后台
      </footer>
    </div>
  );
}