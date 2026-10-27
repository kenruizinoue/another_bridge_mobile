// Expo's winter runtime installs globals (fetch, __ExpoImportMetaRegistry,
// …) as LAZY properties whose getter requires the polyfill on first
// access. Jest 30's globals cleanup enumerates globals after teardown,
// which would trigger those requires "outside the scope of the test code"
// and fail every suite. Touching each getter here forces the require
// while we're still in scope.
for (const key of Object.getOwnPropertyNames(globalThis)) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && typeof desc.get === 'function') {
    try {
      void globalThis[key];
    } catch {
      // a getter that throws in the jest env is fine to skip
    }
  }
}

// Native modules used by the Files view. Mocked at the boundary so any
// suite that imports the app tree (App, ChatScreen) loads without them.
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn() })),
    VideoView: (props) => require('react').createElement(View, { testID: props.testID }),
  };
});
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: (props) => require('react').createElement(View, { testID: props.testID, source: props.source, onError: props.onError }),
  };
});
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: jest.fn(async () => ({ id: 'asset' })) },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
