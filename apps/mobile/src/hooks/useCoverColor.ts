import { useState, useEffect } from 'react';
import { getColors } from 'react-native-image-colors';

const DEFAULT_ACCENT = '#1DB954';
const coverColorMemoryCache = new Map<string, string>();

/**
 * Hook trích xuất màu sắc chủ đạo từ ảnh bìa album/bài hát.
 * Có cơ chế cache trong RAM theo URI để không phân tích lại ảnh nhiều lần.
 * Fallback về màu xanh nhấn mặc định nếu không tải được hoặc có lỗi.
 */
export function useCoverColor(coverUri?: string | null, fallbackColor = DEFAULT_ACCENT): string {
  const [dominantColor, setDominantColor] = useState<string>(() => {
    if (coverUri && coverColorMemoryCache.has(coverUri)) {
      return coverColorMemoryCache.get(coverUri) ?? fallbackColor;
    }
    return fallbackColor;
  });

  useEffect(() => {
    if (!coverUri) {
      setDominantColor(fallbackColor);
      return;
    }

    const cached = coverColorMemoryCache.get(coverUri);
    if (cached) {
      setDominantColor(cached);
      return;
    }

    let isMounted = true;

    getColors(coverUri, {
      fallback: fallbackColor,
      quality: 'low',
    })
      .then((result) => {
        if (!isMounted) return;
        let selectedColor = fallbackColor;

        if (result.platform === 'ios') {
          // Trên iOS, primary hoặc background thể hiện tốt nhất sắc thái bìa
          selectedColor = result.primary || result.background || fallbackColor;
        } else if (result.platform === 'android') {
          selectedColor = result.dominant || result.vibrant || fallbackColor;
        } else if (result.platform === 'web') {
          selectedColor = result.dominant || result.vibrant || fallbackColor;
        }

        coverColorMemoryCache.set(coverUri, selectedColor);
        setDominantColor(selectedColor);
      })
      .catch(() => {
        if (isMounted) {
          coverColorMemoryCache.set(coverUri, fallbackColor);
          setDominantColor(fallbackColor);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [coverUri, fallbackColor]);

  return dominantColor;
}
