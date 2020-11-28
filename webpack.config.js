const path = require('path');
module.exports = {
  entry: "./src/index.ts",
  externals: {
    'simple-peer': {
      commonjs: 'simple-peer'
    }
  },
  output: {
    filename: "simple-peer-files.js",
    path: path.resolve(__dirname, 'dist')
  },
  resolve: {
    extensions: [".webpack.js", ".web.js", ".ts", ".js"]
  },
  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader" }]
  }
}
