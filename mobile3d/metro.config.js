// Metro settings for the 3D app.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// baked textures (.bin) and asset-pack models (.glb) are bundled as files
for (const ext of ['bin', 'glb']) if (!config.resolver.assetExts.includes(ext)) config.resolver.assetExts.push(ext);

// Always the same build of three.js: its examples import the ES module, and a second copy
// (the CommonJS build) would make their classes fail every instanceof check.
const three = require('path').join(__dirname, 'node_modules/three/build/three.module.js');
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: three };
  return (resolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
