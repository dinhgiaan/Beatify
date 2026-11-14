import { describe, it, expect } from 'vitest';

declare const __dirname: string;
declare const require: (mod: string) => {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: string) => string;
  resolve: (...args: string[]) => string;
  join: (...args: string[]) => string;
};

const fs = require('fs');
const path = require('path');

/**
 * Kiểm thử Hồi quy UI/UX cốt lõi (UI Regression Test)
 * Mục đích: Khóa cứng và ngăn chặn mọi hành vi vô tình xóa hoặc làm mất hiệu ứng
 * Animation Background Active (Sliding Active Pill) và các tính năng UI cao cấp của app.
 * Nếu bất kỳ Agent nào sửa code làm mất các thành phần này, test suite sẽ FAIL ngay lập tức!
 */
describe('Bảo toàn Tuyệt đối Hiệu ứng Animation UI/UX Cốt lõi', () => {
  const rootMobileDir = path.resolve(__dirname, '../..');

  it('1. Floating Tab Bar phải luôn có Animation Background Active dạng trượt (Sliding Active Pill)', () => {
    const layoutPath = path.join(rootMobileDir, 'app/(tabs)/_layout.tsx');
    expect(fs.existsSync(layoutPath)).toBe(true);
    const content = fs.readFileSync(layoutPath, 'utf8');

    // Kiểm tra Reanimated shared values và animation
    expect(content).toContain('useSharedValue');
    expect(content).toContain('withSpring');
    expect(content).toContain('useAnimatedStyle');
    expect(content).toContain('dockWidthShared');
    expect(content).toContain('activeIndex');
    expect(content).toContain('slidingActivePill');
    expect(content).toContain('pillAnimStyle');
  });

  it('2. Thống kê Replay phải luôn có Animation Background Active cho các Tab', () => {
    const replayPath = path.join(rootMobileDir, 'app/settings/replay.tsx');
    expect(fs.existsSync(replayPath)).toBe(true);
    const content = fs.readFileSync(replayPath, 'utf8');

    expect(content).toContain('activeTabShared');
    expect(content).toContain('barWidthShared');
    expect(content).toContain('withSpring');
    expect(content).toContain('slidingActivePill');
    expect(content).toContain('pillAnimStyle');
  });

  it('3. Phần Phát nhạc phải luôn có Animation Background Active cho chip Thời gian chuyển bài', () => {
    const playbackPath = path.join(rootMobileDir, 'app/settings/playback.tsx');
    expect(fs.existsSync(playbackPath)).toBe(true);
    const content = fs.readFileSync(playbackPath, 'utf8');

    expect(content).toContain('activeIndexShared');
    expect(content).toContain('containerWidthShared');
    expect(content).toContain('withSpring');
    expect(content).toContain('slidingActivePill');
    expect(content).toContain('pillAnimStyle');
  });

  it('4. Phần Lưu trữ & Lịch sử phải luôn có Animation Background Active cho chip Số bài lưu tối đa', () => {
    const storagePath = path.join(rootMobileDir, 'app/settings/storage.tsx');
    expect(fs.existsSync(storagePath)).toBe(true);
    const content = fs.readFileSync(storagePath, 'utf8');

    expect(content).toContain('activeIndexShared');
    expect(content).toContain('containerWidthShared');
    expect(content).toContain('withSpring');
    expect(content).toContain('slidingActivePill');
    expect(content).toContain('pillAnimStyle');
  });

  it('5. Button Scroll To Top phải dùng icon mũi tên có chân (ArrowUpIcon) và animation dao động nhịp nhàng', () => {
    const btnPath = path.join(rootMobileDir, 'src/components/common/ScrollToTopButton.tsx');
    expect(fs.existsSync(btnPath)).toBe(true);
    const content = fs.readFileSync(btnPath, 'utf8');

    expect(content).toContain('ArrowUpIcon');
    expect(content).toContain('withRepeat');
    expect(content).toContain('translateY');
  });

  it('6. Nhật ký chuyển bài phải luôn có hiệu ứng giãn nở / thu cuộn Accordion mượt mà', () => {
    const logsPath = path.join(rootMobileDir, 'app/settings/transition-logs.tsx');
    expect(fs.existsSync(logsPath)).toBe(true);
    const content = fs.readFileSync(logsPath, 'utf8');

    expect(content).toContain('LayoutAnimation');
    expect(content).toContain('LayoutAnimation.configureNext');
  });
});
