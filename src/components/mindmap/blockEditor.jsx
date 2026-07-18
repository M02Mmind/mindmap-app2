import { useEffect, useRef } from "react";

export const STROKE = {
  "c-purple": "#6C5CE7",
  "c-teal": "#1F8A70",
  "c-coral": "#C96A3C",
  "c-pink": "#B54A72",
  "c-gray": "#7A746D",
};

export const FILL = {
  "c-purple": "#EFE9FB",
  "c-teal": "#E2F7F1",
  "c-coral": "#FFF0E8",
  "c-pink": "#FDEAF2",
  "c-gray": "#F0EFEA",
};

export const isVideoSrc = (src = "") => {
  const s = String(src).toLowerCase();
  return /\.(mp4|webm|ogg|mov)$/i.test(s) || s.startsWith("data:video/");
};

export const makeBlock = (type = "text", content = "") => ({
  id: `b-${Math.random().toString(36).slice(2, 10)}`,
  type,
  content,
});

export const ensureBlocks = (node) => {
  if (Array.isArray(node?.blocks) && node.blocks.length) return node.blocks;
  const fallback = makeBlock("text");
  node.blocks = [fallback];
  return node.blocks;
};

export const SLASH_COMMANDS = [
  { id: "text", label: "Text", make: () => makeBlock("text") },
  { id: "bullet", label: "Bullet", make: () => makeBlock("bullet") },
  { id: "numbered", label: "Numbered", make: () => makeBlock("numbered") },
];

export const fileToDataUrl = async (file) => {
  if (!file) return "";
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

export const fileIcon = (name = "") => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "🎞️";
  if (["pdf", "doc", "docx", "txt"].includes(ext)) return "📄";
  return "📎";
};

export function BlockRow({ block, onChange, onEnter, onBackspaceEmpty, onSlash, autoFocus }) {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter?.();
    } else if (e.key === "Backspace" && !block.content) {
      e.preventDefault();
      onBackspaceEmpty?.();
    } else if (e.key === "/" && !e.shiftKey) {
      onSlash?.(true);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <textarea
        ref={ref}
        value={block.content || ""}
        onChange={(e) => onChange?.({ ...block, content: e.target.value })}
        onKeyDown={handleKeyDown}
        rows={1}
        style={{
          width: "100%",
          minHeight: 32,
          padding: "8px 10px",
          border: "1px solid #D7D4CC",
          borderRadius: 8,
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
          fontSize: 14,
          color: "#1F1E1C",
          background: "#fff",
        }}
      />
    </div>
  );
}

export function SlashMenu({ onClose, onPick, theme }) {
  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        border: "1px solid #D7D4CC",
        borderRadius: 8,
        background: theme?.surface || "#fff",
        boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
        width: 220,
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 6, color: theme?.textSoft || "#6B6963" }}>
        Slash-Befehle
      </div>
      {SLASH_COMMANDS.map((cmd) => (
        <button
          key={cmd.id}
          onClick={() => onPick?.(cmd)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "6px 8px",
            border: "none",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            color: theme?.text || "#1F1E1C",
          }}
        >
          {cmd.label}
        </button>
      ))}
      <button
        onClick={onClose}
        style={{
          marginTop: 4,
          width: "100%",
          padding: "6px 8px",
          border: "none",
          borderRadius: 6,
          background: "#F4F3F0",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Schließen
      </button>
    </div>
  );
}

export function BlockView({ block, theme }) {
  if (!block) return null;

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: theme?.surface2 || "#F7F6F3",
        color: theme?.text || "#1F1E1C",
        border: `1px solid ${theme?.border || "#E6E4DF"}`,
      }}
    >
      {block.content || ""}
    </div>
  );
}

export default function BlockEditor() {
  return null;
}