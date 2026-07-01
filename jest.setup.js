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
