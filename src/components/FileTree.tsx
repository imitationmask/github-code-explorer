"use client";

import { useState } from "react";
import type { FileNode } from "@/types/github";
import { FileTreeNode } from "./FileTreeNode";

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelectFile: (node: FileNode) => void;
}

export function FileTree({ nodes, selectedPath, onSelectFile }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    nodes.forEach((node) => {
      if (node.type === "tree") initial.add(node.path);
    });
    return initial;
  });

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="py-1">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={toggle}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}
