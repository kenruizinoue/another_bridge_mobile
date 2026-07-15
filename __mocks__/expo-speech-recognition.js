// Manual mock, auto-applied by Jest for node modules.
module.exports = {
  ExpoSpeechRecognitionModule: {
    getPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    start: jest.fn(),
    abort: jest.fn(),
  },
};
