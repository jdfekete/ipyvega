const commonConfig = {
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader"
      }
    ]
  }
};

const outputPath = __dirname + "/vega/static";
const outputLibraryTarget = "amd";

module.exports = [
  // the main vega extension
  Object.assign({}, commonConfig, {
    entry: "./src/extension.ts",
    output: {
      hashFunction: "sha256",
      filename: "extension.js",
      path: outputPath,
      libraryTarget: outputLibraryTarget
    }
  }),
  // the widget extension
  Object.assign({}, commonConfig, {
    entry: "./src/index.ts",
    output: {
      hashFunction: "sha256",
      filename: "index.js",
      path: outputPath,
      libraryTarget: outputLibraryTarget
    },
    externals: ["@jupyter-widgets/base"]
  }),
  Object.assign({}, commonConfig, {
    entry: "./src/labplugin.ts",
    output: {
      hashFunction: "sha256",
      filename: "labplugin.js",
      path: outputPath,
      libraryTarget: outputLibraryTarget
    },
    externals: ["@jupyter-widgets/base"]
  }),
];
