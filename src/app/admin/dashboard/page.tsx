"use client";

import { useEffect, useState } from "react";

interface Chapter { id: string; title: string; slug: string; order: number }
interface Lecture {
  id: string; title: string; slug: string; zipName: string;
  category: { id: string; name: string };
  chapters: Chapter[];
  createdAt: string;
}

export default function Dashboard() {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/lectures");
    if (res.ok) setLectures(await res.json());
    setLoading(false);
  }

  async function remove(id: string) {
    if (!confirm("确定删除此讲义？关联文件也会被删除。")) return;
    await fetch(`/api/lectures?id=${id}`, { method: "DELETE" });
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <h1 className="text-2xl font-display font-bold">讲义管理</h1>
        <a href="/admin/upload" className="btn-primary text-sm">
          上传讲义
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 animate-fade-in-up stagger-1">
        <div className="card">
          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>总讲义</div>
          <div className="text-2xl font-bold text-brand">{lectures.length}</div>
        </div>
        <div className="card">
          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>总章节</div>
          <div className="text-2xl font-bold text-brand">
            {lectures.reduce((sum, l) => sum + l.chapters.length, 0)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>分类</div>
          <div className="text-2xl font-bold text-brand">
            {new Set(lectures.map(l => l.category.id)).size}
          </div>
        </div>
      </div>

      {/* Lectures Table */}
      {loading ? (
        <div className="card text-center py-16" style={{ color: 'var(--text-muted)' }}>
          加载中...
        </div>
      ) : lectures.length === 0 ? (
        <div className="card text-center py-16 animate-fade-in-up stagger-2">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
               style={{ background: 'var(--bg-secondary)' }}>
            <span className="text-3xl">📚</span>
          </div>
          <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>暂无讲义</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            点击上方按钮上传第一个讲义包
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-in-up stagger-2">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">标题</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">章节</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {lectures.map((lecture, i) => (
                <tr key={lecture.id} className="border-t border-light stagger-${i}">
                  <td className="px-4 py-3 font-medium">{lecture.title}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded text-xs"
                          style={{ background: 'var(--brand-light)', color: 'var(--brand-primary)' }}>
                      {lecture.category.name}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {lecture.chapters.length} 个
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                    {new Date(lecture.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/student/lecture/${lecture.slug}`}
                       className="text-brand text-xs mr-3 hover:underline">
                      查看
                    </a>
                    <button 
                      onClick={() => remove(lecture.id)}
                       className="text-xs hover:underline"
                       style={{ color: '#dc2626' }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}