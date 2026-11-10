import { useState, useEffect } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * Hook UI-only theo dõi chiều cao bàn phím động (iOS: keyboardWillChangeFrame/keyboardWillHide, Android: keyboardDidShow/keyboardDidHide)
 * Tự động hủy listeners khi unmount để chống rò rỉ bộ nhớ.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      // Trên iOS, e.endCoordinates.height trả về chiều cao chính xác của frame bàn phím
      setKeyboardHeight(e.endCoordinates.height);
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}

