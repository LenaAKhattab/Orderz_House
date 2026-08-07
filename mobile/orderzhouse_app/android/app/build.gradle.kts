import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Apply Google Services only when google-services.json is present (local / CI secret).
val googleServicesJson = file("google-services.json")
if (googleServicesJson.exists()) {
    apply(plugin = "com.google.gms.google-services")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.orderzhouse.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                    ?: error("key.properties is missing keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                    ?: error("key.properties is missing keyPassword")
                storePassword = keystoreProperties.getProperty("storePassword")
                    ?: error("key.properties is missing storePassword")
                val storeFilePath = keystoreProperties.getProperty("storeFile")
                    ?: error("key.properties is missing storeFile")
                storeFile = rootProject.file(storeFilePath)
            }
        }
    }

    defaultConfig {
        applicationId = "com.orderzhouse.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

gradle.taskGraph.whenReady {
    val isReleaseBuild = allTasks.any { task ->
        val name = task.name
        name.contains("Release", ignoreCase = true) &&
            (name.contains("assemble", ignoreCase = true) || name.contains("bundle", ignoreCase = true))
    }
    if (isReleaseBuild && !keystorePropertiesFile.exists()) {
        throw GradleException(
            """
            Release build requires android/key.properties (not committed to git).
            1. Copy android/key.properties.example to android/key.properties
            2. Create a local keystore (see docs/MOBILE_RELEASE.md)
            3. Fill in storePassword, keyPassword, keyAlias, storeFile
            """.trimIndent(),
        )
    }
    if (isReleaseBuild && keystorePropertiesFile.exists()) {
        val releaseConfig = android.signingConfigs.findByName("release")
        if (releaseConfig?.storeFile == null || !releaseConfig.storeFile!!.exists()) {
            throw GradleException(
                "Release keystore file not found. Check storeFile in android/key.properties.",
            )
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
