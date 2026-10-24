import type { FileNode } from "@/types/github";
import { ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelectFile: (node: FileNode) => void;
}

export function FileTreeNode({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelectFile,
}: FileTreeNodeProps) {
  const isDir = node.type === "tree";
  const isExpanded = expanded.has(node.path);

  if (isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={{ paddingLeft: depth * 14 + 8 }}
          className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ChevronRight
            size={14}
            className={`shrink-0 text-muted-2 transition-transform duration-150 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
          {isExpanded ? (
            <FolderOpen size={15} className="shrink-0 text-cyan-400/80" />
          ) : (
            <Folder size={15} className="shrink-0 text-indigo-400/80" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node)}
      style={{ paddingLeft: depth * 14 + 24 }}
      className={`group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] transition-colors ${
        isSelected
          ? "bg-indigo-500/15 text-indigo-200"
          : "text-muted hover:bg-white/5 hover:text-foreground"
      }`}
    >
      <FileCode2
        size={14}
        className={`shrink-0 ${
          isSelected ? "text-indigo-400" : "text-muted-2 group-hover:text-muted"
        }`}
      />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
