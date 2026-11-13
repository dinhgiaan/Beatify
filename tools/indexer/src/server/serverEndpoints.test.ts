import { describe, it, expect } from 'vitest';
import { app } from './index';

describe('Server Endpoints & Security Integration Tests', () => {
  describe('DNS Rebinding & Host Header Protection', () => {
    it('chặn request khi Host header là attacker.com', async () => {
      const res = await app.request('/local-api/status', {
        headers: { Host: 'attacker.com' },
      });
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('DNS Rebinding');
    });

    it('cho phép request khi Host header là 127.0.0.1:4000', async () => {
      const res = await app.request('/local-api/status', {
        headers: { Host: '127.0.0.1:4000' },
      });
      // Endpoint xử lý bình thường (200)
      expect(res.status).toBe(200);
    }, 15000);
  });

  describe('CSRF Protection on Mutations', () => {
    it('chặn request POST khi Origin từ trang web độc hại bên ngoài', async () => {
      const res = await app.request('/local-api/fs/delete', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4000',
          Origin: 'http://malicious-website.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderPath: 'C:\\' }),
      });
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error?: string };
      expect(json.error).toContain('CSRF');
    });

    it('chấp nhận request POST khi Origin là http://localhost:5173', async () => {
      const res = await app.request('/local-api/fs/delete', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4000',
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderPath: '' }),
      });
      // Sẽ qua được tầng CSRF và rơi vào tầng validate 400 (đường dẫn không hợp lệ)
      expect(res.status).toBe(400);
    });
  });

  describe('Import Aliases Compatibility (/inspect vs /preview & /confirm vs /commit)', () => {
    it('cả /local-api/import/inspect và /local-api/import/preview đều tồn tại và trả 400 khi thiếu file', async () => {
      const resInspect = await app.request('/local-api/import/inspect', {
        method: 'POST',
        headers: { Host: '127.0.0.1:4000' },
      });
      expect(resInspect.status).toBe(400);

      const resPreview = await app.request('/local-api/import/preview', {
        method: 'POST',
        headers: { Host: '127.0.0.1:4000' },
      });
      expect(resPreview.status).toBe(400);
    });

    it('cả /local-api/import/confirm và /local-api/import/commit đều tồn tại và trả 400 khi thiếu items', async () => {
      const resConfirm = await app.request('/local-api/import/confirm', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: [] }),
      });
      expect(resConfirm.status).toBe(400);

      const resCommit = await app.request('/local-api/import/commit', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: [] }),
      });
      expect(resCommit.status).toBe(400);
    });
  });
});
