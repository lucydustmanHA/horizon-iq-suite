/**
 * Shared rich-text notes editor used across the entire app.
 * Supports: bold, italic, underline, bullet list, numbered list,
 * indent/outdent (sub-bullets), Tab key for indent, clear formatting,
 * inline image paste (clipboard images inserted as base64),
 * click-to-select images with corner-drag resize, and
 * double-click-to-enlarge lightbox for pasted images.
 */
import { useRef, useState, useEffect, useCallback } from "react";

interface NotesEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
}

export function NotesEditor({ value, onChange, minHeight = "12rem", placeholder = "Start typing notes\u2026" }: NotesEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [init, setInit] = useState(false);
  const isFocused = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Only set innerHTML from the value prop on mount or when the editor is NOT focused.
  useEffect(() => {
    if (!ref.current) return;
    if (!init) {
      ref.current.innerHTML = value || "<p><br></p>";
      setInit(true);
    } else if (!isFocused.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "<p><br></p>";
    }
  }, [value, init]);

  const debouncedSave = useCallback((html: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(html), 400);
  }, [onChange]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Position resize overlay when an image is selected
  const updateOverlay = useCallback(() => {
    if (!selectedImg || !ref.current || !selectedImg.isConnected) {
      setOverlayPos(null);
      return;
    }
    const editorRect = ref.current.getBoundingClientRect();
    const imgRect = selectedImg.getBoundingClientRect();
    setOverlayPos({
      top: imgRect.top - editorRect.top + ref.current.scrollTop,
      left: imgRect.left - editorRect.left + ref.current.scrollLeft,
      width: imgRect.width,
      height: imgRect.height,
    });
  }, [selectedImg]);

  useEffect(() => {
    updateOverlay();
    if (!selectedImg) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t !== selectedImg && !t.closest("[data-resize-handle]")) {
        setSelectedImg(null);
        setOverlayPos(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [selectedImg, updateOverlay]);

  // Single click on image => select for resize; double-click => lightbox
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.preventDefault();
      setSelectedImg(target as HTMLImageElement);
    }
  };

  const handleEditorDblClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.preventDefault();
      setLightboxSrc((target as HTMLImageElement).src);
      setSelectedImg(null);
      setOverlayPos(null);
    }
  };

  // Corner-drag resize handler
  const startResize = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImg || !ref.current) return;
    const startX = e.clientX;
    const startWidth = selectedImg.offsetWidth;
    const aspect = selectedImg.offsetWidth / (selectedImg.offsetHeight || 1);

    const onMove = (ev: MouseEvent) => {
      let dx = ev.clientX - startX;
      if (corner === "tl" || corner === "bl") dx = -dx;
      const newWidth = Math.max(40, startWidth + dx);
      selectedImg.style.width = `${newWidth}px`;
      selectedImg.style.height = `${newWidth / aspect}px`;
      updateOverlay();
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      updateOverlay();
      const html = ref.current?.innerHTML || "";
      debouncedSave(html);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const cmd = (c: string) => {
    document.execCommand(c, false);
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) cmd("outdent"); else cmd("indent");
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData.files;
    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            document.execCommand("insertHTML", false,
              `<img src="${dataUrl}" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;cursor:pointer;" />`
            );
            const html = ref.current?.innerHTML || "";
            debouncedSave(html);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const corners = ["tl", "tr", "bl", "br"] as const;

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 pb-2 border-b border-slate-100 flex-wrap">
        <button onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-slate-100 text-slate-600" title="Bold">B</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-slate-100 text-slate-600" title="Italic">I</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-slate-100 text-slate-600" title="Underline">U</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList", false); ref.current?.focus(); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Bullet list">{"\u2022"} List</button>
        <button onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertOrderedList", false); ref.current?.focus(); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Numbered list">1. List</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); cmd("indent"); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Indent (Tab)">{"\u2192"}</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd("outdent"); }} className="px-2 py-1 rounded text-sm hover:bg-slate-100 text-slate-600" title="Outdent (Shift+Tab)">{"\u2190"}</button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); cmd("removeFormat"); }} className="px-2 py-1 rounded text-xs hover:bg-slate-100 text-slate-400" title="Clear formatting">Aa</button>
      </div>
      <div style={{ position: "relative" }}>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => {
            isFocused.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
            const html = ref.current?.innerHTML || "";
            onChange(html);
          }}
          onInput={() => {
            const html = ref.current?.innerHTML || "";
            debouncedSave(html);
          }}
          onPaste={handlePaste}
          onClick={handleEditorClick}
          onDoubleClick={handleEditorDblClick}
          onKeyDown={handleKeyDown}
          style={{ minHeight }}
          className="outline-none text-sm text-slate-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul_ul]:list-[circle] [&_ul_ul]:pl-5 [&_ul_ul_ul]:list-[square] [&_ul_ul_ul]:pl-5 [&_ol_ol]:pl-5 [&_b]:font-semibold [&_strong]:font-semibold [&_i]:italic [&_u]:underline [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:my-2 [&_img]:cursor-pointer [&_img]:hover:opacity-90 [&_img]:transition-opacity"
          data-placeholder={placeholder}
        />

        {/* Resize overlay for selected image */}
        {selectedImg && overlayPos && (
          <div data-resize-handle style={{ position: "absolute", top: overlayPos.top, left: overlayPos.left, width: overlayPos.width, height: overlayPos.height, border: "2px solid #6366f1", borderRadius: 6, pointerEvents: "none", zIndex: 10 }}>
            {corners.map((c) => (
              <div key={c} data-resize-handle
                style={{
                  position: "absolute", width: 12, height: 12,
                  background: "#6366f1", borderRadius: 2, pointerEvents: "auto",
                  cursor: c === "tl" || c === "br" ? "nwse-resize" : "nesw-resize",
                  ...(c[0] === "t" ? { top: -6 } : { bottom: -6 }),
                  ...(c[1] === "l" ? { left: -6 } : { right: -6 }),
                }}
                onMouseDown={(e) => startResize(e, c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox overlay for enlarged image viewing */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-8 cursor-pointer" onClick={() => setLightboxSrc(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={lightboxSrc} alt="Enlarged" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            <button onClick={() => setLightboxSrc(null)} className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full size-8 flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors text-lg font-bold">{"\u00d7"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
