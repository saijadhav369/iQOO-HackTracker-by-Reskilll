import javax.net.ssl.*
import java.security.cert.X509Certificate
import java.security.SecureRandom

// Disable SSL verification before any dependency resolution
try {
    val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
        override fun getAcceptedIssuers(): Array<X509Certificate>? = null
        override fun checkClientTrusted(certs: Array<X509Certificate>, authType: String) {}
        override fun checkServerTrusted(certs: Array<X509Certificate>, authType: String) {}
    })
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, trustAllCerts, SecureRandom())
    HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.socketFactory)
    HttpsURLConnection.setDefaultHostnameVerifier { _, _ -> true }
} catch (_: Exception) {}

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.5.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21")
        classpath("com.google.devtools.ksp:com.google.devtools.ksp.gradle.plugin:2.0.21-1.0.27")
    }
}
