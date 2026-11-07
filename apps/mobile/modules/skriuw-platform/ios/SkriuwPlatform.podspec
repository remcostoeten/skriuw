Pod::Spec.new do |s|
  s.name           = 'SkriuwPlatform'
  s.version        = '0.1.0'
  s.summary        = 'Home-screen quick actions and launch timing for the Skriuw app'
  s.description    = 'Expo module for the operating-system hooks the Skriuw mobile shell needs outside the Rust core.'
  s.license        = 'MIT'
  s.author         = 'Remco Stoeten'
  s.homepage       = 'https://github.com/remcostoeten/skriuw'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/remcostoeten/skriuw.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
