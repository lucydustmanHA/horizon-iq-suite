/**
 * Shared rich-text notes editor used across the entire app.
 * Supports: bold, italic, underline, bullet list, numbered list,
 * indent/outdent (sub-bullets), Tab key for indent, clear formatting.
 */
import { useRef, useState, useEffect } from "react";

interface NotesEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
}

export function NotesEditor({ value, onChange, minHeight = "12rem", placeholder = "Start typing notes\u2026" }: NotesEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [init, setInit] = useState(false);
  const prevVal = useRef("");

  useEffect(() => {
    if (!ref.current) return;
    if (!init) {
      ref.current.innerHTML = value || "<p><br></p>";
      setInit(true);
      prevVal.current = value;
    } else if (value !== prevVal.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "<p><br></p>";
      prevVal.current = value;
    }
  }, [value, init]);

  const cmd = (c: string) => {
    document.execCommand(c, false);
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        cmd("outdent");
      } else {
        cmd("indent");
      }
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 pb-2 border-b border-slate-100 flex-wrap">
        <button onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-slate-100 text-slate-600" title="Bold">B</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-slate-100 text-slate-600" title="Italic">I</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-slate-100 text-slate-600" title="Underline">U</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList", false); ref.current?.focus(); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Bullet list">• List</button>
        <button onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertOrderedList", false); ref.current?.focus(); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Numbered list">1. List</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); cmd("indent"); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Indent (Tab)">→</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd("outdent"); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Outdent (Shift+Tab)">←</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); cmd("removeFormat"); }} className="px-2 py-1 rounded text-xs hover:bg-slate-100 text-slate-400" title="Clear formatting">Aa</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          const html = ref.current?.innerHTML || "";
          prevVal.current = html;
          onChange(html);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={handleKeyDown}
        style={{ minHeight }}
        className="outline-none text-sm text-slate-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul_ul]:list-[circle] [&_ul_ul]:pl-5 [&_ul_ul_ul]:list-[square] [&_ul_ul_ul]:pl-5 [&_ol_ol]:pl-5 [&_b]:font-semibold [&_strong]:font-semibold [&_i]:italic [&_u]:underline"
        data-placeholder={placeholder}
      />
    </div>
  );
}
