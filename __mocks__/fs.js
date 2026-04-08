const { fs } = require('memfs');

function makeStreamCompatible(stream) {
  Object.defineProperty(stream, 'closed', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: false,
  });

  return stream;
}

const createReadStream = fs.createReadStream.bind(fs);
const createWriteStream = fs.createWriteStream.bind(fs);

fs.createReadStream = (...args) => makeStreamCompatible(createReadStream(...args));
fs.createWriteStream = (...args) => makeStreamCompatible(createWriteStream(...args));
fs.__mock__ = true;
module.exports = fs;
