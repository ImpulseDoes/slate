export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

export const stem = (path: string) => baseName(path).replace(/\.[^.]+$/, "")

export const dirName = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")))

export const joinPath = (dir: string, name: string) => `${dir}${dir.includes("\\") ? "\\" : "/"}${name}`