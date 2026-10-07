package com.adg.remos.discovery

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.DatagramPacket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.net.URL

/**
 * Finds Sonos players on the LAN. JS can't send UDP, so SSDP lives here.
 *
 * Players answer an M-SEARCH for ZonePlayer with a unicast reply, so no
 * multicast lock (and no extra permission) is needed to receive them.
 */
class SonosDiscoveryModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SonosDiscovery"
        private const val TAG = "SonosDiscovery"
        private const val SSDP_ADDRESS = "239.255.255.250"
        private const val SSDP_PORT = 1900
        private const val SEARCH_TARGET = "urn:schemas-upnp-org:device:ZonePlayer:1"
        private const val SEND_COUNT = 3
        private const val SEND_INTERVAL_MS = 400L
    }

    override fun getName(): String = NAME

    /** Resolves with the IPv4 hosts of the ZonePlayers that answered within `timeoutMs`. */
    @ReactMethod
    fun search(timeoutMs: Double, promise: Promise) {
        Thread {
            val sockets = mutableListOf<MulticastSocket>()
            try {
                // One socket per interface so Ethernet and Wi-Fi TVs both send on the LAN.
                for (iface in activeIpv4Interfaces()) {
                    try {
                        sockets += MulticastSocket(0).apply {
                            networkInterface = iface
                            timeToLive = 4
                            soTimeout = 100
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Skipping interface ${iface.name}: ${e.message}")
                    }
                }

                val message = (
                    "M-SEARCH * HTTP/1.1\r\n" +
                        "HOST: $SSDP_ADDRESS:$SSDP_PORT\r\n" +
                        "MAN: \"ssdp:discover\"\r\n" +
                        "MX: 1\r\n" +
                        "ST: $SEARCH_TARGET\r\n\r\n"
                    ).toByteArray(Charsets.US_ASCII)
                val group = InetAddress.getByName(SSDP_ADDRESS)
                val hosts = linkedSetOf<String>()
                val buffer = ByteArray(2048)
                val deadline = System.currentTimeMillis() + timeoutMs.toLong()
                var sent = 0
                var nextSendAt = 0L

                while (System.currentTimeMillis() < deadline) {
                    // UDP can drop a request, so repeat it a few times.
                    if (sent < SEND_COUNT && System.currentTimeMillis() >= nextSendAt) {
                        for (socket in sockets) {
                            try {
                                socket.send(DatagramPacket(message, message.size, group, SSDP_PORT))
                            } catch (e: Exception) {
                                Log.w(TAG, "M-SEARCH send failed: ${e.message}")
                            }
                        }
                        sent++
                        nextSendAt = System.currentTimeMillis() + SEND_INTERVAL_MS
                    }
                    for (socket in sockets) {
                        try {
                            val packet = DatagramPacket(buffer, buffer.size)
                            socket.receive(packet)
                            parseZonePlayerHost(String(packet.data, 0, packet.length, Charsets.US_ASCII))
                                ?.let { hosts += it }
                        } catch (_: SocketTimeoutException) {
                            // Nothing on this socket yet.
                        }
                    }
                }

                promise.resolve(Arguments.fromList(hosts.toList()))
            } catch (e: Exception) {
                promise.reject("SSDP_ERROR", e.message, e)
            } finally {
                sockets.forEach { it.close() }
            }
        }.start()
    }

    /** Resolves with `{ address, prefixLength }` for every active IPv4 address of this device. */
    @ReactMethod
    fun getNetworks(promise: Promise) {
        try {
            val result = Arguments.createArray()
            for (iface in activeIpv4Interfaces()) {
                for (ia in iface.interfaceAddresses) {
                    val address = ia.address as? Inet4Address ?: continue
                    result.pushMap(Arguments.createMap().apply {
                        putString("address", address.hostAddress)
                        putInt("prefixLength", ia.networkPrefixLength.toInt())
                    })
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("NETWORK_ERROR", e.message, e)
        }
    }

    private fun activeIpv4Interfaces(): List<NetworkInterface> =
        NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().filter { iface ->
            iface.isUp && !iface.isLoopback && !iface.isVirtual &&
                iface.inetAddresses.toList().any { it is Inet4Address }
        }

    /** Returns the host of the LOCATION header if the reply is from a ZonePlayer. */
    private fun parseZonePlayerHost(response: String): String? {
        val headers = response.split("\r\n").mapNotNull { line ->
            val colon = line.indexOf(':')
            if (colon <= 0) null else line.substring(0, colon).trim().uppercase() to line.substring(colon + 1).trim()
        }.toMap()
        if (headers["ST"]?.equals(SEARCH_TARGET, ignoreCase = true) != true) return null
        val location = headers["LOCATION"] ?: return null
        return try {
            URL(location).host.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }
}
