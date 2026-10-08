/**
 * So sánh 2 mảng Uint8Array hằng thời gian (constant-time) bảo vệ chống timing attack
 * Chạy an toàn trên mọi runtime (Cloudflare Workers, Node.js, V8)
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Xác thực token
 */
export async function verifyToken(
  inputToken: string | undefined | null,
  expectedToken: string | undefined
): Promise<boolean> {
  if (!inputToken || !expectedToken) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(inputToken);
  const b = encoder.encode(expectedToken);
  return timingSafeEqual(a, b);
}
