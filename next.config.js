/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack(config) {
    // alasql has a dead React Native code path that references react-native-fs.
    // Stub it out so webpack doesn't error trying to resolve it.
    config.resolve.alias['react-native-fs'] = false;
    config.resolve.alias['react-native-fetch-blob'] = false;
    config.resolve.alias['react-native'] = false;
    return config;
  },
};

module.exports = nextConfig;
