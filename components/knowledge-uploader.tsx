"use client";

import { useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";

export function KnowledgeUploader() {
  const [status, setStatus] = useState<string>("Idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name")?.toString().trim();
    const content = formData.get("content")?.toString().trim();

    if (!name || !content) {
      setStatus("Please provide both a name and content.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Uploading...");

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });

      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }

      const data = await response.json();
      setStatus(`Uploaded successfully (documentId: ${data.documentId})`);
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#161a2a]/80 p-6">
      <div>
        <label className="text-xs uppercase tracking-[0.3em] text-[#ef233c]">Knowledge Upload</label>
        <p className="text-sm text-zinc-400">Send a new document into the knowledge base.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="name" className="text-xs uppercase text-zinc-500">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          className="h-10 w-full rounded-lg border border-white/10 bg-[#101526] px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef233c]"
          placeholder="Incident summary"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="content" className="text-xs uppercase text-zinc-500">Content</label>
        <textarea
          id="content"
          name="content"
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-[#101526] px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef233c]"
          placeholder="Paste document content here"
          required
        />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{status}</span>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-full bg-[#ef233c] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#d90429] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef233c]"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload
        </button>
      </div>
    </form>
  );
}
