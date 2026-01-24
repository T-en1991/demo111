export function isAbsolutePath(p: string): boolean {
  // Windows absolute path (e.g. C:\...)
  if (/^[a-zA-Z]:\\/.test(p)) return true
  // Windows absolute path using forward slashes (e.g. C:/...)
  if (/^[a-zA-Z]:\//.test(p)) return true
  // POSIX absolute path (e.g. /home/...)
  if (p.startsWith('/')) return true
  // UNC path (e.g. \\server\share)
  if (p.startsWith('\\\\')) return true
  return false
}
