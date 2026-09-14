/**
 * The Android app this site vouches for.
 *
 * Both values come from the PWABuilder package (assetlinks.json inside the zip)
 * and are public by design — Google's Digital Asset Links file is served to the
 * world at /.well-known/assetlinks.json. There is no secret here: the
 * fingerprint identifies the signing key, it does not grant anything. The
 * keystore itself is the secret, and it never belongs in a repository.
 *
 * To point at a different build, set ASSET_LINKS_JSON (or ANDROID_PACKAGE_NAME
 * plus ANDROID_SHA256_FINGERPRINT) in the host's settings — those win over this
 * file, so a rebuilt app needs no code change.
 */
export const ANDROID_APP_LINKS = [
  {
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: 'app.vercel.operations_management_two.twa',
      sha256_cert_fingerprints: [
        '4E:EE:D8:5A:56:CE:BF:D7:D3:A8:C5:FE:55:73:F4:72:DB:5F:5C:29:40:30:6C:7C:7D:95:E6:7B:5D:4B:6C:29',
      ],
    },
  },
];
