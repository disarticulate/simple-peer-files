const webpack = require('webpack');
const path = require('path');
module.exports = {
  entry: "./src/index.ts",
  externals: {
    'simple-peer': {
      commonjs: 'simple-peer',
      commonjs2: 'simple-peer'
    }
  },
  output: {
    library: 'SimplePeerFiles',
    libraryTarget: 'umd',
    filename: "simple-peer-files.js",
    path: path.resolve(__dirname, 'dist')
  },
  resolve: {
    extensions: [".webpack.js", ".web.js", ".ts", ".js"],
    alias: {
      process: "process/browser"
    }
  },
  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader" }]
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: 'buffer',
      process: 'process/browser'
    })
  ]
}
