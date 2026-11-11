/** "Sun, 16 Nov, 6:30 pm" in the device locale. */
export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

/** Next `count` days as YYYY-MM-DD keys (local), starting today. */
export function upcomingDays(count: number, from = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    return { key, label };
  });
}
