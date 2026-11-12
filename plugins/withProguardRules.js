const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * ML Kit 文字识别靠反射/服务加载，R8 一裁就运行时 NPE。
 * android/ 是 prebuild 产物，直接改 proguard-rules.pro 会被下次 prebuild 覆盖，
 * 所以用 config plugin 注入。
 */
const RULES = `

# ML Kit 文字识别：内部通过反射/服务加载，必须整体保留，否则运行时 NPE
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_common** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.internal.mlkit_vision_text**
`;

module.exports = function withProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app/proguard-rules.pro');
      const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!prev.includes('com.google.mlkit.**')) fs.writeFileSync(file, prev + RULES);
      return cfg;
    },
  ]);
};
