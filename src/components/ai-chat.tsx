import { useState, useRef, useEffect } from "react";
import { $askAI } from "@/lib/ai.server";
import { MessageCircle, X, Send, Sparkles, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { answer } = await $askAI({ data: { question, history } });
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message || "Something went wrong."}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent-indigo text-white shadow-lg hover:scale-105 transition-transform print:hidden"
        title="Ask AI"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[400px] max-h-[600px] flex-col rounded-2xl border border-border bg-card shadow-2xl print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-indigo" />
          <span className="text-sm font-semibold">QX AI Assistant</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[300px] max-h-[440px]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
            <Sparkles className="h-8 w-8 mb-3 text-accent-indigo opacity-50" />
            <p className="text-sm font-medium">Ask me anything about the portfolio</p>
            <p className="text-xs mt-1 opacity-70">I have access to all {171} use cases</p>
            <div className="mt-4 space-y-1.5">
              <button
                onClick={() => setInput("What use cases are flagged?")}
                className="block w-full text-xs text-left px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
              >
                “What use cases are flagged?”
              </button>
              <button
                onClick={() => setInput("Summarize the 2026 pipeline")}
                className="block w-full text-xs text-left px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
              >
                “Summarize the 2026 pipeline”
              </button>
              <button
                onClick={() => setInput("Which workgroups have the most use cases?")}
                className="block w-full text-xs text-left px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
              >
                “Which workgroups have the most use cases?”
              </button>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-accent-indigo text-white"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.role === "assistant" ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                />
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent-indigo" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border px-3 py-2.5 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the portfolio..."
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-indigo/30"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-lg bg-accent-indigo px-3 py-2 text-white disabled:opacity-40 hover:bg-accent-indigo/90 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

/** Simple markdown-to-HTML for LLM responses */
function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-2">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold mt-2">$1</h3>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, '<ul class="list-disc pl-4">$1</ul>')
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
