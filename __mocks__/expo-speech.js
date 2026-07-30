// Manual mock, auto-applied by Jest for node modules. expo-speech's real
// JS reaches for native bindings that don't exist under jest.
module.exports = {
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(async () => false),
};
