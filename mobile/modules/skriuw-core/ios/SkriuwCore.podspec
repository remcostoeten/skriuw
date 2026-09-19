Pod::Spec.new do |s|
  s.name           = 'SkriuwCore'
  s.version        = '0.1.0'
  s.summary        = 'Expo module over the shared Skriuw Rust core'
  s.description    = 'Wraps the UniFFI bindings of crates/skriuw-mobile for React Native.'
  s.license        = 'MIT'
  s.author         = 'Remco Stoeten'
  s.homepage       = 'https://github.com/remcostoeten/skriuw'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/remcostoeten/skriuw.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Both are produced on macOS by scripts/build-ios.sh and never committed.
  s.vendored_frameworks = 'Frameworks/SkriuwMobile.xcframework'
  s.source_files = ['SkriuwCoreModule.swift', 'Generated/*.swift']
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
