import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000, // 1 giây: luôn giữ dữ liệu tươi mới tức thì
      gcTime: 1000 * 60 * 10, // 10 phút giữ cache trong memory
      refetchOnWindowFocus: true, // Tự động đồng bộ ngay khi người dùng quay lại tab trình duyệt
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
