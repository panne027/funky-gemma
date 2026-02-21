module.exports = {
  presets: ['@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          '@core': './src/core',
          '@ui': './src/ui',
          '@types': './src/types',
        },
      },
    ],
  ],
};
