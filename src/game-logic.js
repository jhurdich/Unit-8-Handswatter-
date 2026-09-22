export function pointsForRank(rank) {
  if (rank <= 0) return 0;
  return rank <= 9 ? 11 - rank : 1;
}

export function sortPlayers(players) {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function cleanName(value) {
  return String(value ?? "")
    .replace(/[^\p{L}\p{N} ._'’-]/gu, "")
    .trim()
    .slice(0, 24);
}

export function cleanCode(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
