fn main() {
  #[cfg(target_os = "linux")]
  println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");

  // The Android StorePlugin is an inlined plugin, so its commands need generated ACL
  // permissions — without them every `plugin:store|…` invoke is rejected with
  // "not allowed. Plugin not found" before it ever reaches Kotlin.
  tauri_build::try_build(
    tauri_build::Attributes::new().plugin(
      "store",
      tauri_build::InlinedPlugin::new()
        .commands(&[
          "getStoreInfo",
          "purchaseFullVersion",
          "showRewardedAd",
          "getProductPrice",
          "restorePurchases",
          "showPrivacyOptions",
        ])
        .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    ),
  )
  .expect("failed to run tauri-build")
}
