const path = require('path');

module.exports = {
  entry: './content.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  chrome: "58"
                },
                modules: 'auto'
              }]
            ]
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  mode: 'development',  // Changed to development mode
  devtool: 'source-map',  // Added source maps
  optimization: {
    minimize: true,
    minimizer: [
      new (require('terser-webpack-plugin'))({
        terserOptions: {
          compress: {
            drop_console: false,
            pure_funcs: []
          },
          mangle: true
        }
      })
    ]
  }
};
