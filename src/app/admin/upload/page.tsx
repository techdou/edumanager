"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Category { id: string; name: string }

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  // Load categories
  useState(() => {
    fetch("/api/categories").then(r => r.json()).then(setCategories);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title || !slug || !categoryId) {
      setError("所有字段必填");
      return;
    }
    if (!file.name.endsWith(".zip")) {
      setError("仅支持 ZIP 文件");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("slug", slug);
    formData.append("categoryId", categoryId);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    setLoading(false);

    if (res.ok) {
      setSuccess("上传成功！");
      setTitle("");
      setSlug("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setTimeout(() => router.push("/admin/dashboard"), 1500);
    } else {
      const data = await res.json();
      setError(data.error || "上传失败");
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-display font-bold mb-6 animate-fade-in-up">上传讲义</h1>

      {/* Instructions */}
      <div className="card mb-6 animate-fade-in-up stagger-1" style={{ background: 'var(--bg-accent)' }}>
        <h3 className="font-bold mb-2">ZIP 结构要求</h3>
        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <li>• ZIP 包名作为一级路径</li>
          <li>• 内部目录作为章节路径</li>
          <li>• 每个目录包含 index.html</li>
          <li>• images 等资源同级放置</li>
        </ul>
      </div>

      {/* Form */}
      <div className="card animate-fade-in-up stagger-2">
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm animate-fade-in"
               style={{ background: '#fee2e2', color: '#dc2626' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-lg text-sm animate-fade-in"
               style={{ background: '#dcfce7', color: '#16a34a' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">讲义标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：AI 学习资料"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">URL 标识</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
              placeholder="例如：ai_learning"
              required
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              访问路径: /student/lecture/{slug || "..."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">分类</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
              }}
            >
              <option value="">选择分类</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ZIP 文件</label>
            <input
              ref={fileInput}
              type="file"
              accept=".zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
              }}
            />
            {file && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                已选择: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "上传中..." : "上传"}
          </button>
        </form>
      </div>
    </div>
  );
}