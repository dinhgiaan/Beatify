import React, { useEffect } from 'react';
import { Modal } from 'react-native';

export interface HiddenSettingsModalProps {
  visible?: boolean;
  onClose?: () => void;
  onProfileUpdated?: (profile: unknown) => void;
}

/**
 * Component tương thích ngược cho Settings.
 * Tự động tuân thủ quy tắc đóng an toàn khi được gọi từ legacy context.
 */
  export function HiddenSettingsModal({ visible, onClose }: HiddenSettingsModalProps) {
    useEffect(() => {
      if (visible && onClose) {
        onClose();
      }
    }, [visible, onClose]);

    return (
      <Modal
        visible={Boolean(visible)}
        transparent
        animationType="none"
        onRequestClose={onClose}
      />
    );
  }
