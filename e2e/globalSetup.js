// Starts the mock bridge before Detox boots the app, so the very first
// fetch the app makes already has a server to talk to. The server lives
// in jest's main process for the whole run; globalTeardown closes it.
const detoxGlobalSetup = require('detox/runners/jest/globalSetup');
const { startMockBridge } = require('./mockBridge');

module.exports = async function globalSetup() {
  globalThis.__mockBridge = await startMockBridge();
  await detoxGlobalSetup();
};
