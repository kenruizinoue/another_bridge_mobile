// Manual mock: the real module unzips via native code.
module.exports = {
  unzip: jest.fn(async (_src, dest) => dest),
};
