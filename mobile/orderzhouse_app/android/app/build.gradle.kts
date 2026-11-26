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
    if (isReleaseBuild) {
        verifyReleaseFirebaseConfig(googleServicesJson)
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

// Release safeguard: 8.1.6–8.2.1 shipped without Firebase resources because the plugin was skipped
// silently. Release builds now require the client config of Firebase project orderz-house.
val expectedFirebaseProjectId = "orderz-house"
val expectedAndroidPackage = "com.orderzhouse.app"

fun verifyReleaseFirebaseConfig(configFile: File) {
    if (!configFile.exists()) {
        throw GradleException(
            "Release build requires android/app/google-services.json (Firebase project " +
                "$expectedFirebaseProjectId, app $expectedAndroidPackage). Download it from the " +
                "Firebase console; it is git-ignored. Push notifications cannot work without it.",
        )
    }
    @Suppress("UNCHECKED_CAST")
    val json = groovy.json.JsonSlurper().parse(configFile) as Map<String, Any?>
    if (json.containsKey("private_key") || json["type"] == "service_account") {
        throw GradleException(
            "google-services.json is a service-account credential. Never bundle it; use the " +
                "Android client config from the Firebase console.",
        )
    }
    val projectInfo = json["project_info"] as? Map<*, *>
    val projectId = projectInfo?.get("project_id")?.toString()
    if (projectId != expectedFirebaseProjectId) {
        throw GradleException(
            "google-services.json project_id is '$projectId', expected '$expectedFirebaseProjectId'.",
        )
    }
    val clients = (json["client"] as? List<*>).orEmpty().filterIsInstance<Map<*, *>>()
    val hasApp = clients.any { client ->
        val info = client["client_info"] as? Map<*, *>
        val android = info?.get("android_client_info") as? Map<*, *>
        val appId = info?.get("mobilesdk_app_id")?.toString().orEmpty()
        android?.get("package_name") == expectedAndroidPackage &&
            appId.contains(":android:") && !appId.contains("YOUR_")
    }
    if (!hasApp) {
        throw GradleException(
            "google-services.json has no valid Android client for $expectedAndroidPackage.",
        )
    }
}

// Second line of defence: the processed resources must contain google_app_id.
tasks.configureEach {
    if (name == "processReleaseGoogleServices") {
        doLast {
            val valuesXml = outputs.files.asFileTree.matching { include("**/values.xml") }.files
            val ok = valuesXml.any { it.readText().contains("name=\"google_app_id\"") }
            if (!ok) {
                throw GradleException(
                    "processReleaseGoogleServices produced no google_app_id resource; " +
                        "Firebase would not initialize in this release.",
                )
            }
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
