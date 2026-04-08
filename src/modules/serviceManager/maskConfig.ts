const MASK = '******';

const SECRET_KEYS = new Set([
  'username',
  'password',
  'passphrase',
]);

function maskValue(key: string, value: any) {
  if (key === 'interactiveAuth') {
    if (Array.isArray(value)) {
      return value.map(() => MASK);
    }

    return value;
  }

  if (SECRET_KEYS.has(key)) {
    return MASK;
  }

  if (Array.isArray(value)) {
    return value.map(item => maskValue('', item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, nestedKey) => {
      result[nestedKey] = maskValue(nestedKey, value[nestedKey]);
      return result;
    }, {});
  }

  return value;
}

export default function maskConfig(config) {
  return Object.keys(config).reduce((copy, key) => {
    copy[key] = maskValue(key, config[key]);
    return copy;
  }, {});
}
