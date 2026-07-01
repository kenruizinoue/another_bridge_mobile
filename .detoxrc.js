// Detox E2E config. The app is built as a RELEASE simulator build with
// the JS bundle embedded and EXPO_PUBLIC_* pointing at the local mock
// bridge (e2e/mockBridge.js) — no Metro and no real bridge server are
// involved. Process env wins over .env.local in Expo's env loading, so
// the exported vars below are what land in the bundle.
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 300000,
    },
  },
  apps: {
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/anotherbridgemobile.app',
      build:
        'bash e2e/prepare-ios-headers.sh && ' +
        'export EXPO_PUBLIC_BRIDGE_URL=http://localhost:8093 EXPO_PUBLIC_CODER_KEY=e2e-test-key && ' +
        'xcodebuild -workspace ios/anotherbridgemobile.xcworkspace -scheme anotherbridgemobile ' +
        '-configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 15' },
    },
  },
  configurations: {
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
  },
};
