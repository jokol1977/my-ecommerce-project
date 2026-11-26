import path from "node:path";

function decodeMountInfoPath(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

/** Returns true only when the exact image directory is a Linux mount point. */
export function isExactProductImageMount(mountInfo: string, directory: string): boolean {
  const target = path.posix.normalize(directory);
  if (!path.posix.isAbsolute(target) || target === "/") return false;

  return mountInfo.split(/\r?\n/).some((line) => {
    const fields = line.trim().split(/\s+/);
    const encodedMountPoint = fields[4];
    return typeof encodedMountPoint === "string" && decodeMountInfoPath(encodedMountPoint) === target;
  });
}
