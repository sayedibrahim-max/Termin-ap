// Android: Schnell-Kachel "Termin sprechen" (auch auf dem Sperrbildschirm) und
// App-Anzeige über dem Sperrbildschirm. Erzeugt beim Bauen eine kleine TileService-Klasse
// und trägt sie ins Manifest ein, damit android/ nicht von Hand bearbeitet werden muss.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEEP_LINK = 'terminapp://sprechen';

const tileSource = (pkg) => `package ${pkg}

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class SpeakTileService : TileService() {
  override fun onStartListening() {
    qsTile?.let {
      it.state = Tile.STATE_INACTIVE
      it.updateTile()
    }
  }

  override fun onClick() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${DEEP_LINK}")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    if (Build.VERSION.SDK_INT >= 34) {
      val pending = PendingIntent.getActivity(
        this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
`;

const micVector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF"
      android:pathData="M12,14c1.66,0 3,-1.34 3,-3V5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6c0,1.66 1.34,3 3,3zM17.3,11c0,3 -2.54,5.1 -5.3,5.1S6.7,14 6.7,11H5c0,3.41 2.72,6.23 6,6.72V21h2v-3.28c3.28,-0.48 6,-3.3 6,-6.72h-1.7z"/>
</vector>
`;

function withTileFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android.package;
      const root = cfg.modRequest.platformProjectRoot;
      const srcDir = path.join(root, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'SpeakTileService.kt'), tileSource(pkg));
      const drawDir = path.join(root, 'app/src/main/res/drawable');
      fs.mkdirSync(drawDir, { recursive: true });
      fs.writeFileSync(path.join(drawDir, 'ic_tile_mic.xml'), micVector);
      return cfg;
    },
  ]);
}

function withTileManifest(config, { label }) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = (app.service || []).filter((s) => s.$['android:name'] !== '.SpeakTileService');
    app.service.push({
      $: {
        'android:name': '.SpeakTileService',
        'android:label': label,
        'android:icon': '@drawable/ic_tile_mic',
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.service.quicksettings.ACTIVE_TILE', 'android:value': 'false' } }],
    });

    // App darf über dem Sperrbildschirm erscheinen und den Bildschirm einschalten.
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    main.$['android:showWhenLocked'] = 'true';
    main.$['android:turnScreenOn'] = 'true';
    return cfg;
  });
}

module.exports = function withLockScreenTile(config, props = {}) {
  config = withTileFiles(config);
  config = withTileManifest(config, { label: props.label || 'Termin sprechen' });
  return config;
};
