import javax.net.ssl.*
import java.security.cert.X509Certificate
import java.security.SecureRandom

// Disable SSL verification (corporate proxy / Zscaler workaround)
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
} catch (e: Exception) {
    println("SSL bypass failed: ${e.message}")
}

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "HackTracker"
include(":app")
