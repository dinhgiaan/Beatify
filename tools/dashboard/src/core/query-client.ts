import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 phút không refetch tự động khi switch tab
      gcTime: 1000 * 60 * 30, // 30 phút giữ cache trong memory
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
