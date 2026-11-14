import React, { useEffect } from 'react';
import { Modal } from 'react-native';

export interface ProfileModalProps {
  visible?: boolean;
  onClose?: () => void;
  totalLibraryTracksCount?: number;
  onProfileUpdated?: (profile: unknown) => void;
  initialEditing?: boolean;
}

/**
 * Component tương thích ngược cho Profile.
 * Tự động tuân thủ quy tắc đóng an toàn khi được gọi từ legacy context.
 */
  export function ProfileModal({ visible, onClose }: ProfileModalProps) {
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
