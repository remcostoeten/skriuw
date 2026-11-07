# JNA references java.awt, which does not exist on Android.
-dontwarn java.awt.**
-keep class com.sun.jna.** { *; }
# UniFFI binds Kotlin interfaces and structures to Rust symbols by reflection.
-keep class uniffi.skriuw_mobile.** { *; }
-keep class * implements com.sun.jna.Library { *; }
-keep class * extends com.sun.jna.Structure { *; }
