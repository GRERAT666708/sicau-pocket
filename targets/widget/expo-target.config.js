/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'SicauWidget',
  displayName: '川农课表',
  deploymentTarget: '17.0',
  bundleIdentifier: '.widget',
  colors: {
    $accent: '#10864A',
    $widgetBackground: '#F4F7F3',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
