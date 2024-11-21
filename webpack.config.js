const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    content: './scripts/content.js',
    background: './scripts/background/background.js',
    popup: './popup/popup.js',
    'options/options': './options/options.js',
    'early-blur': './scripts/early-blur.js'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
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
                modules: false
              }]
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "images", to: "images" },
        {
          from: "popup",
          to: "popup",
          globOptions: {
            ignore: ["**/*.js"]
          }
        },
        {
          from: "options",
          to: "options",
          globOptions: {
            ignore: ["**/*.js"]
          }
        },
        {
          from: "keywords",
          to: "keywords"
        },
        {
          from: "styles",
          to: "styles"
        },
        {
          from: "manifest.json",
          to: "manifest.json",
          transform(content) {
            const manifest = JSON.parse(content.toString());

            if (manifest.background && manifest.background.service_worker) {
              manifest.background.service_worker = manifest.background.service_worker.replace('dist/', '');
            }

            if (manifest.content_scripts) {
              manifest.content_scripts.forEach(script => {
                if (script.js) {
                  script.js = script.js.map(path => path.replace('dist/', ''));
                }
              });
            }

            return JSON.stringify(manifest, null, 2);
          }
        }
      ],
    }),
  ],
  resolve: {
    extensions: ['.js'],
    modules: [
      path.resolve(__dirname, 'scripts'),
      'node_modules'
    ]
  },
  mode: 'development',
  devtool: 'inline-source-map', // Changed to inline-source-map for better debugging
  optimization: {
    minimize: false, // Disabled minification for better debugging
    minimizer: [
      new (require('terser-webpack-plugin'))({
        terserOptions: {
          compress: {
            drop_console: false,
            pure_funcs: []
          },
          mangle: false, // Disabled name mangling for better debugging
          output: {
            beautify: true // Pretty output for better debugging
          }
        }
      })
    ]
  }
}
