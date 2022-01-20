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
      hashFunction: "xxhash64",
      filename: "extension.js",
      path: outputPath,
      libraryTarget: outputLibraryTarget
    }
  }),
  // the widget extension
  Object.assign({}, commonConfig, {
    entry: "./src/index.ts",
    output: {
      hashFunction: "xxhash64",
      filename: "index.js",
      path: outputPath,
      libraryTarget: outputLibraryTarget
    },
    externals: ["@jupyter-widgets/base"]
  }),
  Object.assign({}, commonConfig, {
    entry: "./src/labplugin.ts",
    output: {
      hashFunction: "xxhash64",
      filename: "labplugin.js",
      path: outputPath,
      libraryTarget: outputLibraryTarget
    },
    externals: ["@jupyter-widgets/base"]
  }),
];
