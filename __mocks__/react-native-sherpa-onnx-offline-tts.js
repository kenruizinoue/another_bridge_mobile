// Manual mock: the real module binds to the sherpa-onnx native engine.
module.exports = {
  initialize: jest.fn(async () => {}),
  deinitialize: jest.fn(),
  generateAndSave: jest.fn(async (_text, path) => path),
};
