plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.reskill.hacktracker"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.reskill.hacktracker"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    // API base URL is the fallback used when no cfg_api_url extra is passed at
    // provisioning. The setup scripts always pass cfg_api_url, so in normal
    // operation this default is never consulted. It's only used when:
    //   - someone taps the launcher icon on a phone that hasn't been
    //     provisioned through the script (rare), OR
    //   - the QR-code provisioning bundle is missing cfg_api_url.
    //
    // Override at build time (no source edit needed) when the prod API
    // domain changes:
    //   ./gradlew assembleDebug -PapiBaseUrl=https://new-host.example.com/api
    // or via environment variable:
    //   HACKTRACKER_API_URL=https://new-host.example.com/api ./gradlew assembleDebug
    val apiBaseUrl: String = (project.findProperty("apiBaseUrl") as String?)
        ?: System.getenv("HACKTRACKER_API_URL")
        ?: "https://hacktracker.reskilll.com/api"

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    // AndroidX
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // Room
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Gson
    implementation("com.google.code.gson:gson:2.11.0")
}

// Auto-copy the built debug APK into web/public so the dashboard hosts it at
// /app-debug.apk for QR provisioning. Runs automatically after assembleDebug;
// no-op if the APK isn't present.
val copyDebugApkToWeb by tasks.registering(Copy::class) {
    from(layout.buildDirectory.dir("outputs/apk/debug")) {
        include("app-debug.apk")
    }
    into(rootProject.layout.projectDirectory.dir("../web/public"))
}
tasks.matching { it.name == "assembleDebug" }.configureEach {
    finalizedBy(copyDebugApkToWeb)
}
