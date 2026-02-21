const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Load .env file for web build
const envFile = path.resolve(__dirname, '.env');
const envVars = {};
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (match) envVars[match[1]] = match[2].trim();
  });
}

const appDirectory = __dirname;

const babelConfig = {
  presets: [
    ['@babel/preset-env', { targets: { browsers: ['last 2 versions'] } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [
    ['module-resolver', {
      root: ['.'],
      alias: {
        '@core': './src/core',
        '@ui': './src/ui',
        '@types': './src/types',
      },
    }],
  ],
};

// Packages that need to be compiled from node_modules
const compileNodeModules = [
  'react-native-safe-area-context',
].map((m) => path.resolve(appDirectory, `node_modules/${m}`));

module.exports = {
  entry: path.resolve(appDirectory, 'index.web.js'),
  output: {
    path: path.resolve(appDirectory, 'dist'),
    filename: 'bundle.[contenthash].js',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
    alias: {
      'react-native$': 'react-native-web',
      // Stub out native-only modules that don't exist on web
      'cactus-react-native': path.resolve(appDirectory, 'src/web/empty-module.js'),
      'react-native-fs': path.resolve(appDirectory, 'src/web/empty-module.js'),
      '@react-native-async-storage/async-storage': path.resolve(appDirectory, 'src/web/empty-module.js'),
      '@notifee/react-native': path.resolve(appDirectory, 'src/web/empty-module.js'),
      'react-native-calendar-events': path.resolve(appDirectory, 'src/web/empty-module.js'),
      '@env': path.resolve(appDirectory, 'src/web/env-shim.js'),
    },
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        include: [
          path.resolve(appDirectory, 'index.web.js'),
          path.resolve(appDirectory, 'App.tsx'),
          path.resolve(appDirectory, 'src'),
          ...compileNodeModules,
        ],
        use: {
          loader: 'babel-loader',
          options: {
            ...babelConfig,
            configFile: false,
            babelrc: false,
          },
        },
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.CACTUS_TOKEN': JSON.stringify(envVars.CACTUS_TOKEN || ''),
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(appDirectory, 'public/index.html'),
    }),
  ],
  devServer: {
    static: path.resolve(appDirectory, 'public'),
    port: 3000,
    hot: true,
    historyApiFallback: true,
    open: true,
  },
  devtool: 'source-map',
};
