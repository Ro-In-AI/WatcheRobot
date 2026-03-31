export function classifyLogTone(text: string, index: number, total: number) {
  if (/error|fail|nack|timeout|stopped/i.test(text)) {
    return "warning";
  }

  if (index >= Math.max(total - 2, 0)) {
    return "accent";
  }

  return "muted";
}
