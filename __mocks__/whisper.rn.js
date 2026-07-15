// Manual mock, auto-applied by Jest for node modules. whisper.rn links a
// bare native module that can't load under jest.
module.exports = {
  initWhisper: jest.fn(async () => ({
    transcribe: jest.fn(() => ({ promise: Promise.resolve({ result: '' }) })),
  })),
};
