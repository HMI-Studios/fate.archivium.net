import * as path from 'path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
    
const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  mode: process.env.NODE_ENV || 'development',
  entry: './src/main.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    // Parts loaded on demand (like the rich-text editor), named by content so a browser
    // never pairs a cached old one with a new bundle.js.
    chunkFilename: '[name].[contenthash].chunk.js',
    // Old chunks are removed; the hand-written pages and icon in dist/ are kept.
    clean: { keep: /\.(html|svg)$/ },
    publicPath: '/',
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // One copy of each of these for this app and the `archivium` dependency: a second
      // React or Yjs breaks things in confusing ways.
      react$: path.resolve(__dirname, 'node_modules/react'),
      'react-dom$': path.resolve(__dirname, 'node_modules/react-dom'),
      yjs$: path.resolve(__dirname, 'node_modules/yjs'),
    },
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        // The `archivium` dependency is TypeScript source (for its editor), so it's compiled too.
        exclude: /node_modules[\/](?!archivium[\/])/,
        loader: 'swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true,
            },
            transform: {
              react: {
                runtime: 'automatic',
              },
            },
          },
        },
      },
    ],
  },
  // plugins: [
  //   // Optional – use only if needed for dev
  //   new HtmlWebpackPlugin({
  //     template: 'template.html', // You can use a placeholder template
  //   }),
  // ],
};
