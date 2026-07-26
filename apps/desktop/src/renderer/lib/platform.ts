export function isMac(platform: string) {
  return platform === "darwin" || platform.toLowerCase().includes("mac")
}
