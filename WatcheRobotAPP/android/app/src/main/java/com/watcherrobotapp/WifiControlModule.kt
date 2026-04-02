package com.watcherrobotapp

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

class WifiControlModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private val wifiManager =
    reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
  private val connectivityManager =
    reactContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private val handler = Handler(Looper.getMainLooper())

  private var scanReceiver: BroadcastReceiver? = null
  private var scanPromise: Promise? = null
  private var connectPromise: Promise? = null
  private var targetSsid: String? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "WifiControlModule"

  @ReactMethod
  fun scanNearbyNetworks(promise: Promise) {
    if (!wifiManager.isWifiEnabled) {
      promise.reject("WIFI_DISABLED", "Wi-Fi is turned off.")
      return
    }

    cleanupScanReceiver()
    scanPromise = promise

    val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION != intent?.action) {
            return
          }

          resolveScanPromise(buildScanResults())
        }
      }

    scanReceiver = receiver
    reactContext.registerReceiver(
      receiver,
      IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),
    )

    val started =
      try {
        wifiManager.startScan()
      } catch (error: SecurityException) {
        cleanupScanReceiver()
        promise.reject("WIFI_PERMISSION_DENIED", error.message, error)
        false
      } catch (error: Exception) {
        cleanupScanReceiver()
        promise.reject("WIFI_SCAN_FAILED", error.message, error)
        false
      }

    if (!started) {
      handler.postDelayed({ resolveScanPromise(buildScanResults()) }, 250)
      return
    }

    handler.postDelayed(
      {
        if (scanPromise != null) {
          resolveScanPromise(buildScanResults())
        }
      },
      4000,
    )
  }

  @ReactMethod
  fun connectToNetwork(config: ReadableMap, promise: Promise) {
    val ssid = config.getString("ssid")?.trim().orEmpty()
    val password = config.getString("password")?.trim().orEmpty()
    val security = config.getString("security")?.trim().orEmpty().lowercase()

    if (ssid.isBlank()) {
      promise.reject("INVALID_SSID", "Wi-Fi SSID is required.")
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is unavailable.")
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      launchSystemAddNetwork(activity, ssid, password, security, promise)
      return
    }

    addNetworkSuggestion(ssid, password, security, promise)
  }

  @ReactMethod
  fun getCurrentWifiInfo(promise: Promise) {
    try {
      promise.resolve(buildConnectionInfoMap())
    } catch (error: SecurityException) {
      promise.reject("WIFI_PERMISSION_DENIED", error.message, error)
    } catch (error: Exception) {
      promise.reject("WIFI_INFO_FAILED", error.message, error)
    }
  }

  private fun launchSystemAddNetwork(
    activity: Activity,
    ssid: String,
    password: String,
    security: String,
    promise: Promise,
  ) {
    val suggestion = buildNetworkSuggestion(ssid, password, security)
    val intent = Intent(Settings.ACTION_WIFI_ADD_NETWORKS).apply {
      putParcelableArrayListExtra(
        Settings.EXTRA_WIFI_NETWORK_LIST,
        arrayListOf(suggestion),
      )
    }

    connectPromise = promise
    targetSsid = ssid

    try {
      activity.startActivityForResult(intent, REQUEST_CODE_ADD_WIFI_NETWORK)
    } catch (error: Exception) {
      connectPromise = null
      targetSsid = null
      promise.reject("WIFI_ADD_NETWORK_FAILED", error.message, error)
    }
  }

  private fun addNetworkSuggestion(
    ssid: String,
    password: String,
    security: String,
    promise: Promise,
  ) {
    try {
      val suggestion = buildNetworkSuggestion(ssid, password, security)
      val result = wifiManager.addNetworkSuggestions(listOf(suggestion))

      if (result != WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
        promise.reject(
          "WIFI_SUGGESTION_FAILED",
          "Unable to add Wi-Fi suggestion. Error code: $result",
        )
        return
      }

      targetSsid = ssid
      pollConnectionResult(
        onConnected = { promise.resolve(buildConnectResultMap("connected", ssid)) },
        onFallback = { promise.resolve(buildConnectResultMap("saved", ssid)) },
      )
    } catch (error: SecurityException) {
      promise.reject("WIFI_PERMISSION_DENIED", error.message, error)
    } catch (error: Exception) {
      promise.reject("WIFI_SUGGESTION_FAILED", error.message, error)
    }
  }

  private fun buildNetworkSuggestion(
    ssid: String,
    password: String,
    security: String,
  ): WifiNetworkSuggestion {
    val builder = WifiNetworkSuggestion.Builder().setSsid(ssid)
    val normalizedSecurity = if (password.isBlank()) "open" else security

    when {
      password.isBlank() || normalizedSecurity == "open" -> Unit
      normalizedSecurity == "wpa3" || normalizedSecurity == "sae" ->
        builder.setWpa3Passphrase(password)
      else -> builder.setWpa2Passphrase(password)
    }

    return builder.build()
  }

  private fun buildScanResults(): WritableArray {
    val currentSsid = getCurrentConnectedSsid()
    val groupedResults = linkedMapOf<String, ScanResult>()

    wifiManager.scanResults
      .filter { !it.SSID.isNullOrBlank() }
      .sortedByDescending { it.level }
      .forEach { result ->
        val existing = groupedResults[result.SSID]
        if (existing == null || result.level > existing.level) {
          groupedResults[result.SSID] = result
        }
      }

    return Arguments.createArray().apply {
      groupedResults.values.forEach { result ->
        pushMap(
          Arguments.createMap().apply {
            putString("ssid", result.SSID)
            putString("bssid", result.BSSID)
            putInt("level", result.level)
            putInt("frequency", result.frequency)
            putString("security", parseSecurity(result.capabilities))
            putBoolean("requiresPassword", !isOpenNetwork(result.capabilities))
            putBoolean("isConnected", currentSsid == result.SSID)
          },
        )
      }
    }
  }

  private fun buildConnectionInfoMap(): WritableMap =
    Arguments.createMap().apply {
      val capabilities =
        connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)

      putString("ssid", getCurrentConnectedSsid())
      putBoolean(
        "isWifiConnected",
        capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true,
      )
    }

  private fun buildConnectResultMap(status: String, ssid: String): WritableMap =
    Arguments.createMap().apply {
      putString("status", status)
      putString("ssid", ssid)
    }

  private fun resolveScanPromise(results: WritableArray) {
    cleanupScanReceiver()
    scanPromise?.resolve(results)
    scanPromise = null
  }

  private fun cleanupScanReceiver() {
    scanReceiver?.let {
      try {
        reactContext.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    scanReceiver = null
  }

  private fun parseSecurity(capabilities: String?): String {
    val text = capabilities.orEmpty().uppercase()
    return when {
      text.contains("SAE") -> "wpa3"
      text.contains("WPA2") || text.contains("PSK") -> "wpa2"
      text.contains("WPA") -> "wpa"
      text.contains("WEP") -> "wep"
      text.contains("EAP") -> "enterprise"
      else -> "open"
    }
  }

  private fun isOpenNetwork(capabilities: String?): Boolean =
    parseSecurity(capabilities) == "open"

  private fun getCurrentConnectedSsid(): String? {
    val wifiInfo = wifiManager.connectionInfo ?: return null
    val rawSsid = wifiInfo.ssid ?: return null
    if (rawSsid == WifiManager.UNKNOWN_SSID) {
      return null
    }

    return rawSsid.removePrefix("\"").removeSuffix("\"")
  }

  private fun pollConnectionResult(
    attempt: Int = 0,
    onConnected: () -> Unit,
    onFallback: () -> Unit,
  ) {
    val expectedSsid = targetSsid
    if (expectedSsid != null && getCurrentConnectedSsid() == expectedSsid) {
      targetSsid = null
      onConnected()
      return
    }

    if (attempt >= MAX_CONNECTION_POLL_COUNT) {
      targetSsid = null
      onFallback()
      return
    }

    handler.postDelayed(
      { pollConnectionResult(attempt + 1, onConnected, onFallback) },
      CONNECTION_POLL_DELAY_MS,
    )
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_CODE_ADD_WIFI_NETWORK) {
      return
    }

    val promise = connectPromise
    connectPromise = null

    if (promise == null) {
      targetSsid = null
      return
    }

    if (resultCode != Activity.RESULT_OK) {
      val ssid = targetSsid
      targetSsid = null
      promise.reject(
        "WIFI_ADD_NETWORK_CANCELLED",
        "User cancelled Wi-Fi connection for ${ssid ?: "selected network"}.",
      )
      return
    }

    val ssid = targetSsid.orEmpty()
    pollConnectionResult(
      onConnected = { promise.resolve(buildConnectResultMap("connected", ssid)) },
      onFallback = { promise.resolve(buildConnectResultMap("saved", ssid)) },
    )
  }

  override fun onNewIntent(intent: Intent) = Unit

  companion object {
    private const val REQUEST_CODE_ADD_WIFI_NETWORK = 4107
    private const val MAX_CONNECTION_POLL_COUNT = 8
    private const val CONNECTION_POLL_DELAY_MS = 750L
  }
}
