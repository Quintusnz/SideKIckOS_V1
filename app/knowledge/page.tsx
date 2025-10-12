import { KnowledgeUploader } from "@/components/knowledge-uploader";

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ef233c]">Knowledge</p>
        <h1 className="text-xl font-semibold text-zinc-100">Upload Documents</h1>
        <p className="text-sm text-zinc-500">Drop fresh intelligence into the shared knowledge base.</p>
      </header>
      <KnowledgeUploader />
    </div>
  );
}
