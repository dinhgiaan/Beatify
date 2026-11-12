const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Theo dõi toàn bộ monorepo (đặc biệt là packages/shared)
config.watchFolders = [monorepoRoot];

// 2. Định tuyến node_modules cho monorepo pnpm
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Pin singleton để tránh duplicate trong pnpm monorepo
// (quan trọng khi xcodebuild gọi Metro bundle qua symlink)
const singletons = ['react', 'react-native', 'expo', 'expo-router'];
config.resolver.extraNodeModules = singletons.reduce((acc, name) => {
  acc[name] = path.resolve(projectRoot, 'node_modules', name);
  return acc;
}, {});

module.exports = config;
