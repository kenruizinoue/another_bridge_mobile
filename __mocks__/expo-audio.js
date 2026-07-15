// Manual mock, auto-applied by Jest for node modules. expo-audio's real
// JS reaches for native ExpoAudio bindings that don't exist under jest.
module.exports = {
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    uri: null,
  })),
  setAudioModeAsync: jest.fn(async () => {}),
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  AudioQuality: { HIGH: 96 },
};
