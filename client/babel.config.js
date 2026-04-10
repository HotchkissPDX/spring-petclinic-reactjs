module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['@babel/preset-env', { targets: { browsers: 'defaults' } }],
      '@babel/preset-react',
    ],
  };
};
