"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Category { id: string; name: string }
interface Chapter { id: string; title: string; slug: string; order: number }
interface Lecture {
  id: string; title: string; slug: string;
  category: Category;
  chapters: Chapter[];
}

export default function StudentPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [catRes, lecRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/lectures"),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (lecRes.ok) setLectures(await lecRes.json());
      setLoading(false);
    }
    load();
  }, []);

  const filtered = selectedCategory === "all"
    ? lectures
    : lectures.filter(l => l.category.id === selectedCategory);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-8 py-4 flex items-center justify-between border-b border-black/6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <span className="font-display font-bold text-lg">学生浏览</span>
        </div>
        <Link href="/" className="nav-link">返回首页</Link>
      </header>

      {/* Content */}
      <main className="flex-1 px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Title */}
          <h1 className="text-3xl font-display font-bold mb-8 animate-fade-in-up">
            教育讲义
          </h1>

          {/* Filters */}
          {categories.length > 0 && (
            <div className="flex gap-2 mb-6 animate-fade-in-up stagger-1">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedCategory === "all" 
                    ? "bg-brand text-white" 
                    : "bg-white text-secondary border border-medium"
                }`}
              >
                全部
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === cat.id 
                      ? "bg-brand text-white" 
                      : "bg-white text-secondary border border-medium"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Lectures */}
          {loading ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-16">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                   style={{ background: 'var(--bg-secondary)' }}>
                <span className="text-3xl">📚</span>
              </div>
              <p style={{ color: 'var(--text-muted)' }}>暂无讲义</p>
            </div>
          ) : (
            <div className="grid gap-4 animate-fade-in-up stagger-2">
              {filtered.map((lecture, i) => (
                <div key={lecture.id} className="card stagger-${i + 1}">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">{lecture.title}</h2>
                    <span className="text-xs px-3 py-1 rounded-full"
                          style={{ background: 'var(--brand-light)', color: 'var(--brand-primary)' }}>
                      {lecture.category.name}
                    </span>
                  </div>
                  
                  {lecture.chapters.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {lecture.chapters
                        .sort((a, b) => a.order - b.order)
                        .map(ch => (
                          <Link
                            key={ch.id}
                            href={`/student/lecture/${lecture.slug}/${ch.slug}`}
                            className="px-4 py-2 rounded-lg text-sm transition-all hover:translate-y--1"
                            style={{ 
                              background: 'var(--bg-accent)',
                              color: 'var(--brand-primary)',
                              border: '1px solid var(--border-light)'
                            }}
                          >
                            {ch.title}
                          </Link>
                        ))}
                    </div>
                  ) : (
                    <Link
                      href={`/student/lecture/${lecture.slug}`}
                      className="btn-primary inline-block text-sm"
                    >
                      查看讲义
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 text-center text-sm border-t border-black/6"
               style={{ color: 'var(--text-muted)' }}>
        EduManager · 学生浏览
      </footer>
    </div>
  );
}