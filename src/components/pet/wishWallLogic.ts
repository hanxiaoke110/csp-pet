export function formatVoteCooldown(value?: string | null, now = Date.now()): string {
  if (!value) return '';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const remaining = Date.parse(normalized) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return '';
  return `还需 ${Math.ceil(remaining / 86400000)} 天可再次投票`;
}

export function interpretVoteResponse(status: number, data: { success?: boolean; error?: string }): {
  spendTicket: boolean; message: string;
} {
  const success = status >= 200 && status < 300 && data.success === true && !data.error;
  return { spendTicket: success, message: success ? '✅ 投票成功！' : (data.error || '投票未完成，请重试') };
}
