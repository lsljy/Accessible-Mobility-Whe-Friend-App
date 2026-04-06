module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            'react-native-maps': './web-maps-mock.js',
          },
        },
      ],
    ],
  };
};