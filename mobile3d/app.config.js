// Build settings on top of app.json. The android/ folder is generated at build time, so
// everything native is set from here.
const { withGradleProperties } = require('expo/config-plugins');

// R8 code shrinking stays off unless ANDROID_MINIFY=1: it broke the 2D app's release build, and
// an unshrunk build is a few megabytes larger, nothing more.
const MINIFY = process.env.ANDROID_MINIFY === '1';
// Phones only by default (64-bit and 32-bit ARM). ANDROID_ALL_ARCHS=1 adds the emulator ones.
const BUILD_ARCHS = process.env.ANDROID_ALL_ARCHS === '1' ? ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'] : ['arm64-v8a', 'armeabi-v7a'];

// The cloud build machine ran out of memory with Gradle's defaults ("daemon disappeared").
const BUILD_MEMORY = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError',
  'kotlin.daemon.jvmargs': '-Xmx2048m',
  'org.gradle.workers.max': '2',
};

function withBuildMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(BUILD_MEMORY)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

module.exports = ({ config }) => {
  const name = (p) => (Array.isArray(p) ? p[0] : p);
  const plugins = (config.plugins || []).filter((p) => name(p) !== 'expo-build-properties');
  plugins.push([
    'expo-build-properties',
    { android: { enableMinifyInReleaseBuilds: MINIFY, enableShrinkResourcesInReleaseBuilds: MINIFY, buildArchs: BUILD_ARCHS } },
  ]);
  return withBuildMemory({ ...config, plugins });
};
