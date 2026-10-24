/**
 * 浏览器 File System Access API 的类型补充。
 * `FileSystemHandle / FileSystemDirectoryHandle / FileSystemFileHandle` 已由 lib.dom 提供，
 * 此处仅补充尚未收录的 `showDirectoryPicker` 全局函数。
 */

export {};

interface DirectoryPickerOptions {
  /** 复用同一目录时保持一致，浏览器可据此直接恢复权限。 */
  id?: string;
  /** 访问模式，默认 read。 */
  mode?: "read" | "readwrite";
  /** 建议的起始目录。 */
  startIn?: string | FileSystemHandle;
}

declare global {
  interface Window {
    /** Chromium 系浏览器的目录选择器，非 Chromium 环境为 undefined。 */
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
  }

  function showDirectoryPicker(
    options?: DirectoryPickerOptions,
  ): Promise<FileSystemDirectoryHandle>;
}
