module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-redux|@reduxjs/toolkit|react-native-safe-area-context|react-native-ble-plx|react-native-base64|react-native-svg|react-native-vector-icons|react-native-linear-gradient|react-native-shadow-2)/)',
  ],
};
