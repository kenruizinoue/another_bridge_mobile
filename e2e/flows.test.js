// E2E flows against the mock bridge (e2e/mockBridge.js). One sequential
// journey: list → open → read → send (streams a reply) → back.
const { device, element, by, expect, waitFor } = require('detox');

describe('another_bridge_mobile', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('lists the sessions from the bridge', async () => {
    await waitFor(element(by.text('Fix the flaky parser')))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.text('Ship dark mode'))).toBeVisible();
  });

  it('opens a conversation and shows its turns', async () => {
    await element(by.id('session-card-s1')).tap();
    await waitFor(element(by.text('It trips on unterminated fences.')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.text('why is the parser flaky?'))).toBeVisible();
  });

  it('sends a message and renders the streamed reply', async () => {
    await element(by.id('composer-input')).typeText('add a regression test');
    await element(by.id('composer-send')).tap();
    // the canonical assistant turn lands after the mock stream's `done`
    await waitFor(element(by.text('mock reply to: add a regression test')))
      .toBeVisible()
      .withTimeout(20000);
    // and the sent message shows as a user turn
    await expect(element(by.text('add a regression test'))).toBeVisible();
  });

  it('navigates back to the list with the circle back button', async () => {
    await element(by.id('chat-back')).tap();
    await waitFor(element(by.text('Ship dark mode')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
