/* Traço Nativo — casca Android do Traço Notas (v1.0+). Ver CLAUDE.md, seção "App nativo". */
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val vCode = (findProperty("vCode") as String?)?.toIntOrNull() ?: 1
val vName = (findProperty("vName") as String?) ?: "1.0.0-dev"
val ksPath = System.getenv("TRACO_KS")

android {
    namespace = "io.github.vinift.traco.nativo"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.github.vinift.traco.nativo"
        minSdk = 29
        targetSdk = 35
        versionCode = vCode
        versionName = vName
    }
    signingConfigs {
        if (ksPath != null) create("release") {
            storeFile = file(ksPath)
            storePassword = System.getenv("TRACO_KS_PASS")
            keyAlias = "traco"
            keyPassword = System.getenv("TRACO_KS_PASS")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (ksPath != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.graphics:graphics-core:1.0.1")
    implementation("com.google.android.gms:play-services-auth:21.2.0")
}
