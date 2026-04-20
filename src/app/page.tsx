import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">教育讲义管理</h1>
        
        <div className="flex gap-4 justify-center">
          <Link href="/student" className="btn-primary">
            学生浏览
          </Link>
          <Link href="/admin/login" className="btn-secondary">
            管理后台
          </Link>
        </div>
      </div>
    </div>
  );
}