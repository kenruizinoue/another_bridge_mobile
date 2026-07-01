const detoxGlobalTeardown = require('detox/runners/jest/globalTeardown');

module.exports = async function globalTeardown() {
  await detoxGlobalTeardown();
  await new Promise((resolve) => {
    globalThis.__mockBridge ? globalThis.__mockBridge.close(resolve) : resolve();
  });
};
