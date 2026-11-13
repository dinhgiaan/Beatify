import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Switch,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { tokens } from '../../theme/tokens';
import { triggerSelectionHaptic } from '../../utils/haptics';

export interface SettingRowProps {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  value?: string | number | null;
  onPress?: () => void;
  // Biến thể Switch
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (val: boolean) => void;
  // Trạng thái vô hiệu hóa
  disabled?: boolean;
  // Biến thể nguy hiểm (Xóa, reset)
  isDanger?: boolean;
  // Có hiện chevron > khi là nút bấm link
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  rightElement?: React.ReactNode;
}

export function SettingRow({
  label,
  description,
  icon,
  value,
  onPress,
  isSwitch = false,
  switchValue = false,
  onSwitchChange,
  disabled = false,
  isDanger = false,
  showChevron = false,
  style,
  labelStyle,
  rightElement,
}: SettingRowProps) {
  const handlePress = () => {
    if (disabled) return;
    triggerSelectionHaptic();
    if (isSwitch && onSwitchChange) {
      onSwitchChange(!switchValue);
    } else if (onPress) {
      onPress();
    }
  };

  const handleSwitch = (val: boolean) => {
    if (disabled || !onSwitchChange) return;
    triggerSelectionHaptic();
    onSwitchChange(val);
  };

  const content = (
    <View style={[styles.container, disabled && styles.disabled, style]}>
      {Boolean(icon) && <View style={styles.iconBox}>{icon}</View>}

      <View style={styles.textContainer}>
        <Text
          style={[
            styles.label,
            isDanger && styles.dangerLabel,
            labelStyle,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {Boolean(description) && (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>

      <View style={styles.rightBox}>
        {rightElement}

        {value !== undefined && value !== null && (
          <Text style={styles.valueText} numberOfLines={1}>
            {value}
          </Text>
        )}

        {isSwitch && (
          <Switch
            value={switchValue}
            onValueChange={handleSwitch}
            disabled={disabled}
            trackColor={{ false: '#2c2c34', true: tokens.colors.accent }}
            thumbColor="#ffffff"
            ios_backgroundColor="#2c2c34"
          />
        )}

        {showChevron && !isSwitch && (
          <Text style={styles.chevron}>›</Text>
        )}
      </View>
    </View>
  );

  if (onPress && !isSwitch) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.65}
        style={styles.touchable}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  touchable: {
    minHeight: tokens.spacing.minTouchTarget,
    justifyContent: 'center',
  },
  container: {
    minHeight: tokens.spacing.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  disabled: {
    opacity: 0.38,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: tokens.spacing.md,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: tokens.spacing.sm,
  },
  label: {
    ...tokens.typography.body,
    fontSize: 16,
    color: tokens.colors.textPrimary,
  },
  dangerLabel: {
    color: tokens.colors.danger,
  },
  description: {
    ...tokens.typography.footnote,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  rightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  valueText: {
    ...tokens.typography.body,
    color: tokens.colors.textSecondary,
    fontSize: 15,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
    color: tokens.colors.textDim,
    marginLeft: tokens.spacing.xs,
    transform: [{ translateY: -1 }],
  },
});
