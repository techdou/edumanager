"use client";

import { useParams } from "next/navigation";

export default function LectureViewPage() {
  const params = useParams();
  const slug = params.slug as string;
  const chapter = params.chapter as string[] | undefined;

  // 构建讲义路径
  const lecturePath = chapter && chapter.length > 0
    ? `/api/serve/${slug}/${chapter.join("/")}/index.html`
    : `/api/serve/${slug}/index.html`;

  return (
    <div className="min-h-screen bg-white">
      <iframe
        src={lecturePath}
        className="w-full h-screen border-0"
        title="lecture"
      />
    </div>
  );
}