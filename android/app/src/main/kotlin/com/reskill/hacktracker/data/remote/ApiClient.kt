package com.reskill.hacktracker.data.remote

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private var retrofit: Retrofit? = null
    private var currentBaseUrl: String? = null

    fun getService(baseUrl: String): ApiService {
        val url = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        if (retrofit == null || currentBaseUrl != url) {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val client = OkHttpClient.Builder()
                .addInterceptor(logging)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .build()

            retrofit = Retrofit.Builder()
                .baseUrl(url)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()

            currentBaseUrl = url
        }

        return retrofit!!.create(ApiService::class.java)
    }
}
